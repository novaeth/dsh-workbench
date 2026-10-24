import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configSyncApply, configSyncSnapshot, patchBlocks } from '../index.js';
import { assetsOf, planCopies } from '../index.js';
import {
  ASSET_PATCH,
  OUTSIDE_PATCH,
  OWN_PATCH,
  WEB_PATCH,
  homeOf,
  homeWithAsset,
  homeWithPluginDir,
} from './config-sync-home';

describe('配置同步：本地文件资产', () => {
  it('资产扫描只认 insert 行里的路径', () => {
    const home = homeWithAsset();
    const blocks = patchBlocks(readFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8'));
    const insert = blocks.find((block) => block.key === 'insert:usage-report');
    if (insert === undefined) throw new Error('fixture missing');
    const assets = assetsOf(insert, join(home, 'profiles', 'web'), join(home, 'profiles', 'workbench'));
    expect(assets).toHaveLength(1);
    expect(planCopies(assets, join(home, 'profiles', 'web'), join(home, 'profiles', 'workbench'), new Set()).ok).toBe(true);
  });

  it('快照：insert 行引用的本地文件会列出来，缺文件就算候选', () => {
    const home = homeWithAsset();
    const snapshot = configSyncSnapshot({
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
    });
    const row = snapshot.rows.find((item) => item.key === 'insert:usage-report');
    expect(row?.state).toBe('new');
    expect(row?.assets).toEqual([
      {
        key: 'asset:plugins/report-usage.js',
        path: 'plugins/report-usage.js',
        kind: 'file',
        state: 'missing',
        files: [{ path: 'plugins/report-usage.js', state: 'missing', bytes: 24 }],
        bytes: 24,
      },
    ]);
  });

  it('文本一样但文件缺：行仍然列出来，状态是 same', () => {
    const home = homeWithAsset();
    writeFileSync(
      join(home, 'profiles', 'workbench', 'cordis.patch.yml'),
      `${OWN_PATCH}\n${ASSET_PATCH}`,
      'utf8',
    );
    const snapshot = configSyncSnapshot({
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
    });
    const row = snapshot.rows.find((item) => item.key === 'insert:usage-report');
    expect(row?.state).toBe('same');
    expect(row?.assets[0]?.state).toBe('missing');
  });

  it('文本一样只缺文件：只复制文件、不改 patch，重组通过', async () => {
    const home = homeWithAsset();
    const patchPath = join(home, 'profiles', 'workbench', 'cordis.patch.yml');
    writeFileSync(patchPath, `${OWN_PATCH}\n${ASSET_PATCH}`, 'utf8');
    const before = readFileSync(patchPath, 'utf8');
    let calls = 0;
    const deps = {
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
      reconcile: async () => {
        calls += 1;
      },
    };
    const outcome = await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:plugins/report-usage.js'],
    });
    expect(outcome).toEqual({
      ok: true,
      written: [],
      skipped: [],
      files: ['plugins/report-usage.js'],
      verified: true,
    });
    expect(calls).toBe(1);
    expect(readFileSync(patchPath, 'utf8')).toBe(before);
    expect(readFileSync(join(home, 'profiles', 'workbench', 'plugins', 'report-usage.js'), 'utf8')).toBe(
      'export const usage = 1;\n',
    );
  });

  it('应用：复制行引用的文件，重组通过后 verified', async () => {
    const home = homeWithAsset();
    let calls = 0;
    const deps = {
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
      reconcile: async () => {
        calls += 1;
      },
    };
    const outcome = await configSyncApply(deps, {
      source: 'web',
      keys: ['insert:usage-report'],
      overwrite: [],
      assets: ['asset:plugins/report-usage.js'],
    });
    expect(outcome).toEqual({
      ok: true,
      written: ['usage-report'],
      skipped: [],
      files: ['plugins/report-usage.js'],
      verified: true,
    });
    expect(calls).toBe(1);
    expect(readFileSync(join(home, 'profiles', 'workbench', 'plugins', 'report-usage.js'), 'utf8')).toBe(
      'export const usage = 1;\n',
    );
  });

  it('重组失败：恢复 patch、删掉这次复制的文件', async () => {
    const home = homeWithAsset();
    const deps = {
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
      reconcile: async () => {
        throw new Error('插件起不来');
      },
    };
    const outcome = await configSyncApply(deps, {
      source: 'web',
      keys: ['insert:usage-report'],
      overwrite: [],
      assets: ['asset:plugins/report-usage.js'],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.text).toContain('已恢复原来的设置');
    expect(existsSync(join(home, 'profiles', 'workbench', 'plugins', 'report-usage.js'))).toBe(false);
    expect(readFileSync(join(home, 'profiles', 'workbench', 'cordis.patch.yml'), 'utf8')).toBe(OWN_PATCH);
  });

  it('工作台已有同名文件且内容不同：默认不覆盖，勾上才覆盖', async () => {
    const home = homeWithAsset();
    const target = join(home, 'profiles', 'workbench', 'plugins');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'report-usage.js'), 'old\n', 'utf8');
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    const refused = await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:plugins/report-usage.js'],
    });
    expect(refused).toEqual({ ok: false, text: '文件不一样：plugins/report-usage.js。勾上覆盖再试' });
    expect(readFileSync(join(target, 'report-usage.js'), 'utf8')).toBe('old\n');
    const overwritten = await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:plugins/report-usage.js'],
      overwriteAssets: ['asset:plugins/report-usage.js'],
    });
    expect(overwritten.ok).toBe(true);
    expect(readFileSync(join(target, 'report-usage.js'), 'utf8')).toBe('export const usage = 1;\n');
  });

  it('目录资产：列全部文件，应用时整目录复制', async () => {
    const home = homeWithPluginDir();
    const dir = join(home, 'profiles', 'workbench', 'plugins', 'usage-report');
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    const snapshot = configSyncSnapshot(deps);
    const row = snapshot.rows.find((item) => item.key === 'insert:usage-dir');
    expect(row?.assets[0]?.kind).toBe('dir');
    expect(row?.assets[0]?.files.map((file) => file.path)).toEqual([
      'plugins/usage-report/helper.js',
      'plugins/usage-report/index.js',
    ]);
    const outcome = await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:plugins/usage-report'],
    });
    expect(outcome.ok).toBe(true);
    expect(readFileSync(join(dir, 'index.js'), 'utf8')).toBe('export const index = 1;\n');
    expect(readFileSync(join(dir, 'helper.js'), 'utf8')).toBe('export const helper = 1;\n');
  });

  it('profile 外面的文件：标出来，应用时拒绝', async () => {
    const home = homeOf();
    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), `${WEB_PATCH}\n${OUTSIDE_PATCH}`, 'utf8');
    writeFileSync(join(home, 'profiles', 'outside-plugin.js'), 'export {};\n', 'utf8');
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    const snapshot = configSyncSnapshot(deps);
    const row = snapshot.rows.find((item) => item.key === 'insert:outside-plugin');
    expect(row?.assets[0]?.state).toBe('external');
    expect(await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:../outside-plugin.js'],
    })).toEqual({ ok: false, text: '这个文件搬不过来：../outside-plugin.js（这个文件在 profile 外面）' });
  });

  it('重组失败时把覆盖过的文件也恢复', async () => {
    const home = homeWithAsset();
    const target = join(home, 'profiles', 'workbench', 'plugins');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'report-usage.js'), 'old\n', 'utf8');
    const deps = {
      home,
      self: 'workbench',
      profileDir: join(home, 'profiles', 'workbench'),
      reconcile: async () => {
        throw new Error('插件起不来');
      },
    };
    const outcome = await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:plugins/report-usage.js'],
      overwriteAssets: ['asset:plugins/report-usage.js'],
    });
    expect(outcome.ok).toBe(false);
    expect(readFileSync(join(target, 'report-usage.js'), 'utf8')).toBe('old\n');
  });

  it('来源里没有这个文件：标出来，不写任何东西', async () => {
    const home = homeOf();
    writeFileSync(
      join(home, 'profiles', 'web', 'cordis.patch.yml'),
      `${WEB_PATCH}\n- insert:\n    - id: missing-file\n      name: ./plugins/nope.js\n`,
      'utf8',
    );
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    const snapshot = configSyncSnapshot(deps);
    const row = snapshot.rows.find((item) => item.key === 'insert:missing-file');
    expect(row?.assets[0]?.state).toBe('external');
    expect(row?.assets[0]?.reason).toBe('来源里没有这个文件');
    expect(await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:plugins/nope.js'],
    })).toEqual({ ok: false, text: '这个文件搬不过来：plugins/nope.js（来源里没有这个文件）' });
  });

  it('选中的文件在来源里找不到：给一句重读', async () => {
    const home = homeWithAsset();
    const deps = { home, self: 'workbench', profileDir: join(home, 'profiles', 'workbench') };
    expect(await configSyncApply(deps, {
      source: 'web',
      keys: [],
      assets: ['asset:plugins/not-there.js'],
    })).toEqual({ ok: false, text: '选中的文件在来源里已经找不到了，重新读一遍再试' });
  });
});
