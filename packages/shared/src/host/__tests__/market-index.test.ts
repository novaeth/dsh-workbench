import { describe, expect, it } from 'vitest';
import type { MarketIndex, MarketIndexEntry } from '../../contract/protocol/market-index.js';
import {
  filterMarketIndex,
  marketInstallTarget,
  marketSourceKey,
  parseMarketIndex,
  parseMarketIndexJson,
  parseSourceConfig,
  upsertMarketEntry,
} from '../market-index.js';

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
