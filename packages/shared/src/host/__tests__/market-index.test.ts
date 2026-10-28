import { describe, expect, it } from 'vitest';
import type { MarketIndex, MarketIndexEntry } from '../../contract/protocol/market-index.js';
import { claimOf, claimOfEntry, entryOwnerOf, entryUnitOf, marketArtifactPath, samePublisher } from '../market-index-claim.js';
import {
  assembleMarketIndex,
  collectMarketEntryFiles,
  filterMarketIndex,
  marketEntryFilesOf,
  marketEntryPath,
  marketInstallTarget,
  marketMetaPath,
  marketSourceKey,
  parseMarketEntryDoc,
  parseMarketIndex,
  parseMarketIndexJson,
  parseSourceConfig,
  upsertMarketEntry,
} from '../market-index.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function entry(change: Partial<MarketIndexEntry> = {}): MarketIndexEntry {
  return {
    name: '@scope/module-x',
    versions: [
      {
        version: '0.1.1',
        source: { type: 'npm', registry: 'https://npm.company.com/' },
        publishTimestamp: 1_760_000_000,
      },
      { version: '0.1.0', source: { type: 'npm' } },
    ],
    metadata: { category: 'workbench', labels: ['workbench'], keywords: ['缺陷'] },
    ...change,
  };
}

function indexOf(entries: readonly MarketIndexEntry[]): unknown {
  return { format: 1, title: { zh: '工作台模块' }, plugins: entries };
}

describe('parseMarketIndex', () => {
  it('收下一份合法的 format 1', () => {
    const parsed = parseMarketIndex(indexOf([entry()]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.index.plugins[0]?.name).toBe('@scope/module-x');
    expect(parsed.index.title).toEqual({ zh: '工作台模块' });
  });

  it('★ metadata.workbench 是身份标记，labels 可以为空（不再靠 workbench 标签）', () => {
    const parsed = parseMarketIndex(indexOf([entry({ metadata: { workbench: true } })]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.index.plugins[0]?.metadata).toEqual({ workbench: true });
  });

  it('format 不是 1 就整份拒', () => {
    const parsed = parseMarketIndex({ format: 2, plugins: [] });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]?.kind).toBe('format');
  });

  it('版本没按 SemVer 降序就整份拒', () => {
    const parsed = parseMarketIndex(indexOf([entry({ versions: [
      { version: '0.1.0', source: { type: 'npm' } },
      { version: '0.1.1', source: { type: 'npm' } },
    ] })]));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]?.kind).toBe('version-order');
  });

  it('git source 只接受 40 位小写 commit', () => {
    const parsed = parseMarketIndex(indexOf([entry({ versions: [
      { version: '0.1.0', source: { type: 'git', url: 'https://git.company.com/wb/market.git', commit: 'v0.1.0' } },
    ] })]));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]?.kind).toBe('git-commit');
  });

  it('同名插件整份拒', () => {
    const parsed = parseMarketIndex(indexOf([entry(), entry()]));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]?.kind).toBe('duplicate-name');
  });

  it('JSON 读不懂是 not-json', () => {
    const parsed = parseMarketIndexJson('{');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]?.kind).toBe('not-json');
  });

  it('收下 owner，原样写回', () => {
    const parsed = parseMarketIndex(indexOf([entry({ owner: '陈康 <kang@example.com>' })]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.index.plugins[0]?.owner).toBe('陈康 <kang@example.com>');
  });

  it('owner 只收一行：带换行整份拒', () => {
    const parsed = parseMarketIndex(indexOf([entry({ owner: '陈康\n<b>' })]));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]?.kind).toBe('owner');
  });

  it('收下 metadata.unit；不是合法模块 id 整份拒', () => {
    const parsed = parseMarketIndex(indexOf([entry({ metadata: { unit: 'inventory' } })]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.index.plugins[0]?.metadata?.unit).toBe('inventory');
    const bad = parseMarketIndex(indexOf([entry({ metadata: { unit: 'Not A Unit' } })]));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.problems[0]?.kind).toBe('unit');
  });
});

describe('upsertMarketEntry', () => {
  const base: MarketIndex = {
    format: 1,
    plugins: [entry({ versions: [{ version: '0.1.0', source: { type: 'npm' } }] })],
  };

  it('新版本合并进去并按 SemVer 降序', () => {
    const next = upsertMarketEntry(base, entry({ versions: [
      { version: '0.1.2', source: { type: 'npm' } },
      { version: '0.1.1', source: { type: 'npm' } },
    ] }));
    expect(next.plugins[0]?.versions.map((one) => one.version)).toEqual(['0.1.2', '0.1.1', '0.1.0']);
  });

  it('同版本覆盖，不新增第二条', () => {
    const next = upsertMarketEntry(base, entry({ versions: [
      { version: '0.1.0', source: { type: 'git', url: 'https://git.company.com/wb/market.git', commit: 'a'.repeat(40) } },
    ] }));
    expect(next.plugins[0]?.versions).toHaveLength(1);
    expect(next.plugins[0]?.versions[0]?.source.type).toBe('git');
  });

  it('已有 owner 就翻不过来：后来的条目只加版本', () => {
    const owned = upsertMarketEntry(
      { format: 1, plugins: [entry({ owner: '甲 <a@example.com>' })] },
      entry({ owner: '乙 <b@example.com>', versions: [{ version: '0.2.0', source: { type: 'npm' } }] }),
    );
    expect(owned.plugins[0]?.owner).toBe('甲 <a@example.com>');
    expect(owned.plugins[0]?.versions[0]?.version).toBe('0.2.0');
  });
});

describe('认领', () => {
  const owned = entry({ owner: '陈康 <kang@example.com>' });

  it('没有条目是 new，条目没 owner 也没 author 是 unowned', () => {
    expect(claimOfEntry(undefined, '陈康')).toEqual({ state: 'new' });
    expect(claimOfEntry(entry(), '陈康')).toEqual({ state: 'unowned' });
  });

  it('邮箱相同就算同一人，大小写不影响', () => {
    expect(samePublisher('陈康 <KANG@example.com>', '陈康 <kang@example.com>')).toBe(true);
  });

  it('两边都有邮箱时邮箱说了算：姓名不同也算同一人', () => {
    expect(samePublisher('陈康 <kang@example.com>', 'Kang Chen <kang@example.com>')).toBe(true);
  });

  it('只有一边有邮箱就比姓名：格式漂了也认', () => {
    expect(samePublisher('陈康', '陈康 <kang@example.com>')).toBe(true);
  });

  it('姓名和邮箱都不同就是冲突', () => {
    expect(claimOfEntry(owned, '乙 <yi@example.com>')).toEqual({
      state: 'conflict',
      owner: '陈康 <kang@example.com>',
    });
  });

  it('原主自己发是 owned；没给身份时是 unknown', () => {
    expect(claimOfEntry(owned, '陈康 <kang@example.com>')).toEqual({
      state: 'owned',
      owner: '陈康 <kang@example.com>',
    });
    expect(claimOfEntry(owned, '')).toEqual({ state: 'unknown' });
  });

  it('老条目只有 author：把它当 owner 认', () => {
    const legacy = entry({ author: '陈康 <kang@example.com>' });
    expect(entryOwnerOf(legacy)).toBe('陈康 <kang@example.com>');
    expect(claimOf({ format: 1, plugins: [legacy] }, { name: '@scope/module-x', publisher: '陈康' })).toEqual({
      state: 'owned',
      owner: '陈康 <kang@example.com>',
    });
  });

  it('别的条目用了同一个 unit：unit-taken；老条目从产物目录认出 unit', () => {
    const other = entry({ name: '@scope/other', owner: '乙', metadata: { unit: 'inventory' } });
    expect(claimOf({ format: 1, plugins: [other] }, { name: '@scope/module-x', publisher: '甲', unit: 'inventory' })).toEqual({
      state: 'unit-taken',
      entry: '@scope/other',
    });
    const legacy = entry({
      name: '@scope/legacy',
      versions: [
        {
          version: '0.1.0',
          source: {
            type: 'git',
            url: 'https://git.company.com/wb/market.git',
            commit: 'a'.repeat(40),
            path: 'packages/inventory',
          },
        },
      ],
    });
    expect(entryUnitOf(legacy)).toBe('inventory');
    expect(claimOf({ format: 1, plugins: [legacy] }, { name: '@scope/module-x', publisher: '甲', unit: 'inventory' }).state).toBe(
      'unit-taken',
    );
  });

  it('同一个条目自己再用同 unit / 同产物目录，不算撞', () => {
    const mine = entry({
      owner: '甲',
      metadata: { unit: 'inventory' },
      versions: [
        {
          version: '0.1.0',
          source: {
            type: 'git',
            url: 'https://git.company.com/wb/market.git',
            commit: 'a'.repeat(40),
            path: marketArtifactPath('@scope/module-x'),
          },
        },
      ],
    });
    expect(
      claimOf(
        { format: 1, plugins: [mine] },
        {
          name: '@scope/module-x',
          publisher: '甲',
          unit: 'inventory',
          artifactPath: marketArtifactPath('@scope/module-x'),
        },
      ).state,
    ).toBe('owned');
  });

  it('别的条目占了同一个产物目录：path-taken', () => {
    const other = entry({
      name: '@scope/other',
      owner: '乙',
      versions: [
        {
          version: '0.1.0',
          source: {
            type: 'git',
            url: 'https://git.company.com/wb/market.git',
            commit: 'a'.repeat(40),
            path: marketArtifactPath('@scope/module-x'),
          },
        },
      ],
    });
    expect(
      claimOf(
        { format: 1, plugins: [other] },
        { name: '@scope/module-x', publisher: '甲', unit: 'x', artifactPath: marketArtifactPath('@scope/module-x') },
      ),
    ).toEqual({ state: 'path-taken', entry: '@scope/other' });
  });
});

describe('filterMarketIndex', () => {
  const index: MarketIndex = {
    format: 1,
    plugins: [
      entry(),
      entry({ name: '@scope/module-y', metadata: { category: 'data', labels: ['cmdb'], keywords: ['服务'] } }),
    ],
  };

  it('按 label 过滤', () => {
    expect(filterMarketIndex(index, { label: 'cmdb' }).map((one) => one.name)).toEqual(['@scope/module-y']);
  });

  it('按分类过滤', () => {
    expect(filterMarketIndex(index, { category: 'workbench' }).map((one) => one.name)).toEqual(['@scope/module-x']);
  });

  it('关键词搜中文描述', () => {
    expect(filterMarketIndex(index, { query: '缺陷' }).map((one) => one.name)).toEqual(['@scope/module-x']);
  });
});

describe('索引源与安装目标', () => {
  it('sourceKey 忽略 localPath', () => {
    const one = marketSourceKey({ kind: 'git', url: 'https://git.company.com/wb/market.git', ref: 'main' });
    const other = marketSourceKey({
      kind: 'git',
      url: 'https://git.company.com/wb/market.git',
      ref: 'main',
      localPath: '/Users/x/market',
    });
    expect(one).toBe(other);
  });

  it('npm 目标带 registry，git 目标带 commit 与 path', () => {
    expect(marketInstallTarget('@scope/x', '0.1.1', { type: 'npm', registry: 'https://npm.company.com/' })).toEqual({
      spec: '@scope/x@0.1.1',
      registry: 'https://npm.company.com/',
    });
    expect(
      marketInstallTarget('@scope/x', '0.1.1', {
        type: 'git',
        url: 'https://git.company.com/wb/market.git',
        commit: 'a'.repeat(40),
        path: 'packages/module-x',
      }),
    ).toEqual({
      spec: `git+https://git.company.com/wb/market.git#${'a'.repeat(40)}&path:/packages/module-x`,
    });
  });

  it('http 源拒带凭据', () => {
    const parsed = parseSourceConfig({
      id: 'team',
      label: '团队市场',
      kind: 'http',
      url: 'https://user:token@git.company.com/market.json',
    });
    expect(parsed.ok).toBe(false);
  });

  it('git 源收 scp 与 ssh 用户名形式，拒带密码', () => {
    expect(parseSourceConfig({ id: 'team', label: '团队', kind: 'git', url: 'git@git.company.com:wb/market.git' }).ok).toBe(true);
    expect(
      parseSourceConfig({ id: 'team', label: '团队', kind: 'git', url: 'ssh://git@git.company.com/wb/market.git' }).ok,
    ).toBe(true);
    expect(
      parseSourceConfig({ id: 'team', label: '团队', kind: 'git', url: 'https://user:token@git.company.com/wb/market.git' }).ok,
    ).toBe(false);
    expect(
      parseSourceConfig({ id: 'team', label: '团队', kind: 'git', url: 'ssh://git:token@git.company.com/wb/market.git' }).ok,
    ).toBe(false);
  });
});

describe('条目文件：一个版本一个文件', () => {
  const versionDoc = (version: string, timestamp: number, title: string) => ({
    name: '@scope/module-x',
    version,
    source: { type: 'npm' },
    publishTimestamp: timestamp,
    title: { zh: title },
  });

  it('路径按包名分层，meta 文件带 epoch 与随机后缀', () => {
    expect(marketEntryPath('market', '@scope/module-x', '0.1.0')).toBe('market/@scope/module-x/0.1.0.json');
    expect(marketMetaPath('market', '@scope/module-x', 3, 'a1b2c3')).toBe(
      'market/@scope/module-x/meta-3-a1b2c3.json',
    );
    expect(marketEntryPath('market', 'plain', '1.0.0')).toBe('market/plain/1.0.0.json');
  });

  it('包名/版本号不合法就不给路径（防止写出目录外）', () => {
    expect(() => marketEntryPath('market', '../escape', '1.0.0')).toThrow();
    expect(() => marketEntryPath('market', 'ok', '../1.0.0')).toThrow();
  });

  it('单条文档能解析，坏文档整条拒', () => {
    const good = parseMarketEntryDoc(versionDoc('0.1.0', 1_760_000_000, '探针'));
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.doc.name).toBe('@scope/module-x');
    const bad = parseMarketEntryDoc({ name: 'Bad Name', version: '0.1.0', source: { type: 'npm' } });
    expect(bad.ok).toBe(false);
    const noSource = parseMarketEntryDoc({ name: '@scope/x', version: '0.1.0' });
    expect(noSource.ok).toBe(false);
  });

  it('组装：版本全收并按 SemVer 降序，元数据取最新那份', () => {
    const files = [
      { path: 'market/@scope/module-x/0.1.0.json', text: JSON.stringify(versionDoc('0.1.0', 1_760_000_000, '旧标题')) },
      { path: 'market/@scope/module-x/0.2.0.json', text: JSON.stringify(versionDoc('0.2.0', 1_760_000_100, '新标题')) },
      { path: 'market/@scope/module-x/meta-1760000200000.json', text: JSON.stringify({
        name: '@scope/module-x',
        publishTimestamp: 1_760_000_200,
        title: { zh: '最新标题' },
      }) },
    ];
    const assembled = assembleMarketIndex(files);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const entry = assembled.index.plugins[0];
    expect(entry?.versions.map((one) => one.version)).toEqual(['0.2.0', '0.1.0']);
    expect(entry?.title?.zh).toBe('最新标题');
  });

  it('组装：同一个版本出现两次就整份拒（那是真重复发布）', () => {
    const assembled = assembleMarketIndex([
      { path: 'a/0.1.0.json', text: JSON.stringify(versionDoc('0.1.0', 1_760_000_000, '甲')) },
      { path: 'b/0.1.0.json', text: JSON.stringify(versionDoc('0.1.0', 1_760_000_100, '乙')) },
    ]);
    expect(assembled.ok).toBe(false);
    if (assembled.ok) return;
    expect(assembled.problems.some((one) => one.kind === 'duplicate-version')).toBe(true);
  });

  it('从目录读只收 .json，README 不当条目', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-entry-'));
    try {
      mkdirSync(join(dir, '@scope/module-x'), { recursive: true });
      writeFileSync(join(dir, 'README.md'), 'index');
      writeFileSync(join(dir, '@scope/module-x', '0.1.0.json'), JSON.stringify(versionDoc('0.1.0', 1_760_000_000, '探针')));
      const files = collectMarketEntryFiles(dir);
      expect(files.map((one) => one.path)).toEqual(['@scope/module-x/0.1.0.json']);
      const assembled = assembleMarketIndex(files);
      expect(assembled.ok).toBe(true);
      if (!assembled.ok) return;
      expect(assembled.index.plugins[0]?.name).toBe('@scope/module-x');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('迁移：一份 format 1 能拆成条目文件，再组装回来一模一样', () => {
    const legacy: MarketIndex = {
      format: 1,
      plugins: [
        {
          name: '@scope/module-x',
          owner: '甲',
          metadata: { workbench: true, unit: 'x' },
          versions: [
            { version: '0.2.0', source: { type: 'npm' }, publishTimestamp: 1_760_000_100 },
            { version: '0.1.0', source: { type: 'npm' }, publishTimestamp: 1_760_000_000 },
          ],
        },
      ],
    };
    const files = marketEntryFilesOf(legacy, 'market');
    expect(files.map((one) => one.path)).toEqual([
      'market/@scope/module-x/0.2.0.json',
      'market/@scope/module-x/0.1.0.json',
    ]);
    const assembled = assembleMarketIndex(files);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.index.plugins).toEqual(legacy.plugins);
  });
});
