import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PatchBlock } from '../index.js';
import {
  configSyncApply,
  configSyncHandler,
  configSyncSnapshot,
  mergeBlocks,
  normalizeBlock,
  patchBlocks,
  readPatchBlocks,
  syncRows,
  writePatchFile,
} from '../index.js';
import { OWN_PATCH, WEB_PATCH, homeOf } from './config-sync-home';

function idBlocksOf(text: string): PatchBlock[] {
  return patchBlocks(text).filter((block) => !block.insert);
}

describe('配置同步：行块切分', () => {
  it('顶层 `- ` 才起一块，缩进的 id 不算', () => {
    const blocks = patchBlocks(WEB_PATCH);
    expect(blocks.map((block) => block.key)).toEqual([
      'id:web',
      'insert:web-search-exa',
      'id:llm-pi-ai',
    ]);
    expect(blocks.map((block) => block.id)).toEqual(['web', 'web-search-exa', 'llm-pi-ai']);
    expect(blocks[1]?.insert).toBe(true);
    expect(blocks[1]?.names).toEqual(['@deepseek-ai/dsh-web-search-exa']);
  });

  it('空层（dsh 写的 `[]` 加注释头）切不出块', () => {
    expect(patchBlocks('# 注释\n\n[]\n')).toEqual([]);
  });
});

describe('配置同步：文本归一化', () => {
  it('归一化去掉注释、空行与行尾空白', () => {
    expect(normalizeBlock('- id: a\n  # 解释\n  config:\n    x: 1  \n\n')).toBe('- id: a\n  config:\n    x: 1');
  });
});

describe('配置同步：行级差集', () => {
  it('源有我没有 = new，不一样 = differs；内容一样与只有工作台有的都不列', () => {
    const rows = syncRows(patchBlocks(WEB_PATCH), patchBlocks(OWN_PATCH), () => []);
    expect(rows.map((row) => [row.key, row.state])).toEqual([
      ['id:web', 'new'],
      ['id:llm-pi-ai', 'new'],
    ]);
  });

  it('内容一样的行不进列表，只有工作台有的行也不进列表', () => {
    const rows = syncRows(patchBlocks(WEB_PATCH), patchBlocks(WEB_PATCH), () => []);
    expect(rows).toEqual([]);
    const ownOnly = syncRows([], patchBlocks(OWN_PATCH), () => []);
    expect(ownOnly).toEqual([]);
  });

  it('挂新插件的 insert 行不进候选（插件没过来就不该同步它的配置）', () => {
    const rows = syncRows(patchBlocks(WEB_PATCH), [], () => []);
    expect(rows.some((row) => row.key.startsWith('insert:'))).toBe(false);
  });

  it('行点名的包没装时带缺包提醒', () => {
    const rows = syncRows(patchBlocks(WEB_PATCH), [], (block) =>
      block.names.filter((name) => name.includes('llm-pi-ai')),
    );
    const row = rows.find((one) => one.key === 'id:llm-pi-ai');
    expect(row?.missing).toEqual(['@deepseek-ai/dsh-llm-pi-ai']);
  });

  it('own 里同 key 的行在，标记为 differs，并给出两边原文', () => {
    const own = patchBlocks(WEB_PATCH.replace('searchProvider: exa', 'searchProvider: http'));
    const rows = syncRows(patchBlocks(WEB_PATCH), own, () => []);
    expect(rows[0]?.state).toBe('differs');
    expect(rows[0]?.body).toContain('searchProvider: exa');
    expect(rows[0]?.ownBody).toContain('searchProvider: http');
  });

  it('没有的行 ownBody 是 null，body 是可直接摆出来的原文', () => {
    const rows = syncRows(patchBlocks(WEB_PATCH), [], () => []);
    expect(rows[0]?.ownBody).toBeNull();
    expect(rows[0]?.body).toBe(patchBlocks(WEB_PATCH)[0]?.body);
  });
});

describe('配置同步：写回', () => {
  it('新行追加到自己的 patch 末尾，冲突行默认不动', () => {
    const merged = mergeBlocks(OWN_PATCH, idBlocksOf(WEB_PATCH), new Set());
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.written).toEqual(['web', 'llm-pi-ai']);
    expect(merged.skipped).toEqual([]);
    expect(patchBlocks(merged.text).map((block) => block.key)).toEqual([
      'id:session-persistence-jsonl',
      'id:ui-theme',
      'id:web',
      'id:llm-pi-ai',
    ]);
    expect(merged.text).toContain("dshHomePath('workbench/sessions')");
  });

  it('没勾覆盖 → 同名行跳过；勾了覆盖 → 原地换掉', () => {
    const own = patchBlocks(WEB_PATCH.replace('searchProvider: exa', 'searchProvider: http'));
    const keep = mergeBlocks(WEB_PATCH, own, new Set());
    expect(keep.ok).toBe(true);
    if (keep.ok) {
      expect(keep.written).toEqual([]);
      expect(keep.skipped).toEqual(['web', 'web-search-exa', 'llm-pi-ai']);
      expect(keep.text).toBe(WEB_PATCH);
    }
    const take = mergeBlocks(WEB_PATCH, own, new Set(['id:web']));
    expect(take.ok).toBe(true);
    if (take.ok) {
      expect(take.written).toEqual(['web']);
      expect(take.text).toContain('searchProvider: http');
      expect(take.text).not.toContain('searchProvider: exa');
      expect(patchBlocks(take.text)).toHaveLength(3);
    }
  });

  it('空层（`[]`）里加行时把 `[]` 拿掉，否则那不是合法序列', () => {
    const merged = mergeBlocks('# 注释\n\n[]\n', idBlocksOf(WEB_PATCH), new Set());
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.text).not.toContain('[]');
    expect(patchBlocks(merged.text)).toHaveLength(2);
  });

  it('一行都不选 / 没有新行 → 原文不动', () => {
    const merged = mergeBlocks(OWN_PATCH, [], new Set());
    expect(merged).toEqual({ ok: true, text: OWN_PATCH, written: [], skipped: [] });
  });
});

describe('配置同步：读写文件与快照', () => {
  it('路由处理器按外壳的约定回 ok:true 信封（少了它客户端一律当失败）', () => {
    const home = homeOf();
    const handler = configSyncHandler({
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
    });
    const payload = handler(new URLSearchParams()) as { ok?: unknown; source?: unknown; rows?: unknown };
    expect(payload.ok).toBe(true);
    expect(payload.source).toBe('web');
    expect(Array.isArray(payload.rows)).toBe(true);
    const bogus = handler(new URLSearchParams('source=nope')) as { source?: unknown };
    expect(bogus.source).toBe('web');
  });

  it('readPatchBlocks 读不到时给一句人话，而不是抛', () => {
    const read = readPatchBlocks(join('/tmp', 'wb-not-there', 'cordis.patch.yml'));
    expect(read.ok).toBe(false);
  });

  it('writePatchFile 原子写、内容能读回', () => {
    const home = homeOf();
    const path = join(home, 'profiles', 'workbench', 'cordis.patch.yml');
    writePatchFile(path, '# 新\n- id: a\n');
    expect(readFileSync(path, 'utf8')).toBe('# 新\n- id: a\n');
  });

  it('快照默认挑 web、只列候选行、来源上的数就是候选数、缺包标出来', () => {
    const home = homeOf();
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    const snapshot = configSyncSnapshot(deps);
    expect(snapshot.source).toBe('web');
    expect(snapshot.profiles.map((profile) => profile.name)).toEqual(['web']);
    expect(snapshot.emptyProviders).toBe(true);
    expect(snapshot.profiles[0]?.candidates).toBe(snapshot.rows.length);
    expect(snapshot.rows.every((row) => row.state === 'new' || row.state === 'differs')).toBe(true);
    expect(snapshot.rows.some((row) => row.key.startsWith('insert:'))).toBe(false);
  });

  it('不列隔离行，并把来源里的 workbench 路径改写成目标 profile', async () => {
    const home = homeOf();
    mkdirSync(join(home, 'profiles', 'wb2'), { recursive: true });
    writeFileSync(join(home, 'profiles', 'wb2', 'package.json'), JSON.stringify({ name: 'wb2' }), 'utf8');
    writeFileSync(join(home, 'profiles', 'wb2', 'cordis.patch.yml'), '[]\n', 'utf8');
    writeFileSync(
      join(home, 'profiles', 'web', 'cordis.patch.yml'),
      `${WEB_PATCH}
- id: session-persistence-jsonl
  config:
    root: !!js dshHomePath('workbench/sessions')

- id: custom
  config:
    root: !!js dshHomePath('workbench/custom')
`,
      'utf8',
    );
    const deps = { home, self: 'wb2', profileDir: join(home, 'profiles', 'wb2') };
    const snapshot = configSyncSnapshot(deps);
    expect(snapshot.rows.some((row) => row.key === 'id:session-persistence-jsonl')).toBe(false);
    const custom = snapshot.rows.find((row) => row.key === 'id:custom');
    expect(custom?.body).toContain("dshHomePath('wb2/custom')");
    const applied = await configSyncApply(deps, { source: 'web', keys: ['id:custom'] });
    expect(applied.ok).toBe(true);
    const text = readFileSync(join(home, 'profiles', 'wb2', 'cordis.patch.yml'), 'utf8');
    expect(text).toContain("dshHomePath('wb2/custom')");
  });

  it('快照：没有别的 profile 时说清楚；profile 目录拿不到时也说清楚', () => {
    const home = homeOf();
    const only = configSyncSnapshot({ home, self: 'web', profileDir: join(home, 'profiles', 'web') });
    expect(only.profiles.map((profile) => profile.name)).toEqual(['workbench']);
    expect(only.reason).toBeUndefined();
    const nowhere = configSyncSnapshot({ home: join(home, 'nope'), self: 'workbench', profileDir: null });
    expect(nowhere.reason).toBe('拿不到当前 profile 目录');
  });

  it('应用的拒绝路径：没说来源 / 来源是自己 / 来源不存在 / 选的行没了', async () => {
    const home = homeOf();
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    expect(await configSyncApply(deps, {})).toEqual({ ok: false, text: '没说清从哪个 profile 同步哪几行' });
    expect(await configSyncApply(deps, { source: 'workbench', keys: ['id:web'] })).toEqual({
      ok: false,
      text: '来源不能是工作台自己',
    });
    expect(await configSyncApply(deps, { source: 'nope', keys: ['id:web'] })).toEqual({
      ok: false,
      text: '没有这个 profile：nope',
    });
    expect(await configSyncApply(deps, { source: 'web', keys: ['id:missing'] })).toEqual({
      ok: false,
      text: '选中的行在来源里已经找不到了，重新读一遍再试',
    });
    expect(await configSyncApply(deps, { source: 'web', keys: ['insert:web-search-exa'] })).toEqual({
      ok: false,
      text: '插件行不同步：先把插件装到工作台这边，再同步它的设置',
    });
    expect(await configSyncApply({ ...deps, profileDir: null }, { source: 'web', keys: ['id:web'] })).toEqual({
      ok: false,
      text: '拿不到当前 profile 目录，这次没写任何东西',
    });
  });

  it('应用：把选中的行写进自己的工作台 patch，并把没勾覆盖的记成 skipped', async () => {
    const home = homeOf();
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    const outcome = await configSyncApply(deps, { source: 'web', keys: ['id:web', 'id:llm-pi-ai'], overwrite: [] });
    expect(outcome).toEqual({ ok: true, written: ['web', 'llm-pi-ai'], skipped: [], verified: false });
    const text = readFileSync(join(home, 'profiles', 'workbench', 'cordis.patch.yml'), 'utf8');
    expect(patchBlocks(text).map((block) => block.key)).toEqual([
      'id:session-persistence-jsonl',
      'id:ui-theme',
      'id:web',
      'id:llm-pi-ai',
    ]);
  });

  it('没有可用的重组服务：写入成功但 verified 是 false', async () => {
    const home = homeOf();
    const deps = {
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
      reconcile: async () => false,
    };
    const outcome = await configSyncApply(deps, { source: 'web', keys: ['id:web'] });
    expect(outcome).toEqual({ ok: true, written: ['web'], skipped: [], verified: false });
  });

  it('读不到来源或自己的 patch：各给一句人话', async () => {
    const home = homeOf();
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{bad json', 'utf8');
    const snapshot = configSyncSnapshot(deps);
    expect(snapshot.rows.length).toBeGreaterThan(0);
    expect(snapshot.rows[0]?.missing).toEqual([]);
    rmSync(join(home, 'profiles', 'web', 'cordis.patch.yml'));
    expect((await configSyncApply(deps, { source: 'web', keys: ['id:web'] })).ok).toBe(false);
    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), WEB_PATCH, 'utf8');
    rmSync(join(home, 'profiles', 'workbench', 'cordis.patch.yml'));
    expect(configSyncSnapshot(deps).reason).toBeDefined();
  });
});
