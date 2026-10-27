import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DshHostContext } from '../../api/dsh.js';
import { loadAdapterSet, resolveAdapterSet } from '../adapter-set.js';

const dirs: string[] = [];

function profileOf(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-adapter-set-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-profile', private: true, type: 'module' }));
  return dir;
}

function install(dir: string, name: string, source: string): void {
  const pkg = join(dir, 'node_modules', name);
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(pkg, 'index.js'), source);
}

function installEsmOnly(dir: string, name: string, source: string): void {
  const pkg = join(dir, 'node_modules', name);
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', exports: { '.': { import: './index.js' } } }),
  );
  writeFileSync(join(pkg, 'index.js'), source);
}

function installDual(dir: string, name: string, esmSource: string, cjsSource: string): void {
  const pkg = join(dir, 'node_modules', name);
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      exports: { '.': { import: './index.mjs', require: './index.cjs' } },
    }),
  );
  writeFileSync(join(pkg, 'index.mjs'), esmSource);
  writeFileSync(join(pkg, 'index.cjs'), cjsSource);
}

function ctxOf(dir: string | null): DshHostContext {
  return {
    get: (key: string) => (key === 'profileContext' && dir !== null ? { dir } : undefined),
  } as unknown as DshHostContext;
}

const FULL = `{
  apiVersion: 1,
  id: 'fixture',
  version: '1.0.0',
  data: {
    read: async () => ({ ok: true, data: {} }),
    request: async () => ({ ok: true, data: {} }),
    requestMany: async () => ({}),
    submit: async () => ({ ok: true, data: {} }),
  },
  supply: {
    resolvePluginSource: () => ({ ok: false, problem: 'not-declared' }),
    libInstallCommand: () => '',
    pluginInstallPlan: () => ({ ok: false, problem: 'not-declared' }),
    latestVersion: async () => undefined,
    missingReleaseParts: async () => [],
    probeRelease: async () => undefined,
    splitNpmSpec: () => undefined,
  },
  profile: {
    dirOf: () => null,
    dshPlugins: () => () => ({ ok: true, plugins: [] }),
    selfUpdateView: () => undefined,
  },
  probe: {
    probeUnits: async () => [],
    registerPreflight: () => {},
    declaredPluginCommands: () => new Map(),
  },
}`;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('loadAdapterSet：从 profile 解析 set，失败不抛', () => {
  it('没配置 → not-configured（不是错误）', async () => {
    const loaded = await loadAdapterSet(ctxOf(profileOf()), undefined);
    expect(loaded).toMatchObject({ ok: false, failure: 'not-configured' });
  });

  it('不是包名 → malformed', async () => {
    const loaded = await loadAdapterSet(ctxOf(profileOf()), './local-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'malformed' });
  });

  it('没有 profile → no-profile', async () => {
    const loaded = await loadAdapterSet(ctxOf(null), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'no-profile' });
  });

  it('没有 profile 时先报 no-profile，不先纠结包名', async () => {
    const loaded = await loadAdapterSet(ctxOf(null), './local-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'no-profile' });
  });

  it('profile 里没装 → not-resolvable', async () => {
    const loaded = await loadAdapterSet(ctxOf(profileOf()), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'not-resolvable' });
  });

  it('只导出 import 条件的 ESM 包也能从 profile 解析', async () => {
    const dir = profileOf();
    installEsmOnly(dir, 'esm-set', `export function createAdapterSet() { return ${FULL}; }`);
    const loaded = await loadAdapterSet(ctxOf(dir), 'esm-set');
    expect(loaded.ok).toBe(true);
  });

  it('双条件包走 import 那一份入口，不是 require 的 CJS 面', async () => {
    const dir = profileOf();
    installDual(
      dir,
      'dual-set',
      `export function createAdapterSet() { return ${FULL}; }`,
      'module.exports = { notTheFactory: 1 };',
    );
    const loaded = await loadAdapterSet(ctxOf(dir), 'dual-set');
    expect(loaded.ok).toBe(true);
  });

  it('正常 set → ok，返回 core 成员', async () => {
    const dir = profileOf();
    install(dir, 'fixture-set', `export function createAdapterSet() { return ${FULL}; }`);
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.spec).toBe('fixture-set');
      expect(loaded.set.data).toBeDefined();
      expect(loaded.set.probe).toBeDefined();
    }
  });

  it('没有工厂 → bad-export', async () => {
    const dir = profileOf();
    install(dir, 'fixture-set', 'export const nope = 1;');
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'bad-export' });
  });

  it('工厂抛错 → factory-failed', async () => {
    const dir = profileOf();
    install(dir, 'fixture-set', 'export function createAdapterSet() { throw new Error("boom"); }');
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'factory-failed' });
  });

  it('协议版本不对 → incompatible-version', async () => {
    const dir = profileOf();
    install(dir, 'fixture-set', `export function createAdapterSet() { return { ...${FULL}, apiVersion: 2 }; }`);
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'incompatible-version' });
  });

  it('少成员 → missing-member，点名缺哪个', async () => {
    const dir = profileOf();
    install(
      dir,
      'fixture-set',
      'export function createAdapterSet() { return { apiVersion: 1, id: "fixture", version: "1.0.0", data: { read: async () => ({ ok: true, data: {} }) }, profile: { dirOf: () => null }, probe: { probeUnits: async () => [] } }; }',
    );
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'missing-member' });
    if (!loaded.ok) expect(loaded.detail).toContain('supply');
  });

  it('缺 id / version → missing-member，点名', async () => {
    const dir = profileOf();
    install(
      dir,
      'fixture-set',
      'export function createAdapterSet() { return { apiVersion: 1, data: { read: async () => ({ ok: true, data: {} }) }, supply: { resolvePluginSource: () => ({ ok: false, problem: "not-declared" }) }, profile: { dirOf: () => null }, probe: { probeUnits: async () => [] } }; }',
    );
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'missing-member' });
    if (!loaded.ok) expect(loaded.detail).toContain('id');
  });

  it('关键方法不是函数 → missing-member', async () => {
    const dir = profileOf();
    install(
      dir,
      'fixture-set',
      'export function createAdapterSet() { return { apiVersion: 1, id: "fixture", version: "1.0.0", data: {}, supply: { resolvePluginSource: () => ({ ok: false, problem: "not-declared" }) }, profile: { dirOf: () => null }, probe: { probeUnits: async () => [] } }; }',
    );
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'missing-member' });
    if (!loaded.ok) expect(loaded.detail).toContain('data.read');
  });

  it('完整 set → 不建、不 seed 默认集合', async () => {
    const dir = profileOf();
    install(
      dir,
      'full-set',
      `export function createAdapterSet() { return ${FULL.replace('  probe: {', '  modules: new Proxy({}, { get: () => () => undefined }), runtime: new Proxy({}, { get: () => () => undefined }), plugins: new Proxy({}, { get: () => () => undefined }), actions: new Proxy({}, { get: () => () => undefined }),\n  probe: {')}; }`,
    );
    const resolved = await resolveAdapterSet(ctxOf(dir), 'full-set', async () => {
      throw new Error('完整 set 不该建默认');
    });
    expect(resolved.load.ok).toBe(true);
    expect(resolved.usedDefaults).toBe(false);
    expect(resolved.set.id).toBe('fixture');
  });

  it('入口加载失败 → import-failed', async () => {
    const dir = profileOf();
    install(dir, 'fixture-set', 'export function createAdapterSet( {');
    const loaded = await loadAdapterSet(ctxOf(dir), 'fixture-set');
    expect(loaded).toMatchObject({ ok: false, failure: 'import-failed' });
  });
});
