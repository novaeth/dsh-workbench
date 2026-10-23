import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InstalledModule } from '@/shared/api/host/installed-module';
import { resetReleaseCache } from '@/shared/api/host/release';
import { createMarketService } from '../model/market';
import { registerMarketTools } from '../model/market-tools';
import { panelsUnit } from '../unit';
import {
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_LIST_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
} from '../unit';
import { call, cleanupRoots, fakeBundles, harness, ledgerWith, libUnit, unit } from './market-tools-harness';

function expectLossless(value: unknown): void {
  expect(structuredClone(value)).toStrictEqual(value);
}

beforeEach(() => {
  resetReleaseCache();
});

afterEach(cleanupRoots);

describe('workbench_modules_*：一个动词一把工具', () => {
  it('★ 声明的工具名 === 实际注册的（防漂移）；读的那把不是写，其余八把都是写', () => {
    const h = harness({ manifests: [unit('issues', 'demo')] });

    const declared = panelsUnit.tools
      .map((tool) => tool.name)
      .filter((name) => name.startsWith('workbench_modules'));
    expect(declared).toContain(MODULES_LIST_TOOL);
    expect(declared).toHaveLength(9);
    expect([...h.registered.map((tool) => tool.name)].sort()).toEqual([...declared].sort());

    const writes = new Map(panelsUnit.tools.map((tool) => [tool.name, tool.writes]));
    for (const name of h.registered.map((tool) => tool.name)) {
      expect(writes.get(name), name).toBe(name !== MODULES_LIST_TOOL);
    }
    expect(h.registered.map((tool) => tool.name)).not.toContain('workbench_modules');
  });

  it('list：给模型一段能读的目录', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo'), unit('builds', 'build', { kind: 'git', url: 'git@x' })],
      statuses: { issues: 'ok', builds: 'missing-plugin' },
    });

    const payload = await call(h, MODULES_LIST_TOOL, {});

    expect(String(payload.text)).toContain('issues · 已装，可用 · 插件 demo');
    expect(String(payload.text)).toContain('builds · 未装 · 插件 build');
  });

  it('★ 列表结果必须是 lossless JSON：显式 undefined 会让整个工具判失败', async () => {
    const h = harness({ manifests: [libUnit('builds', 'opencli-workflow')] });

    const payload = await call(h, MODULES_LIST_TOOL, {});

    expect(String(payload.text)).toContain('lib:opencli-workflow');
    expectLossless(payload);
  });

  it('★ 名字即动作：每把工具的参数里都没有 action 那一格（别退回去）', () => {
    const h = harness({ manifests: [unit('issues', 'demo')] });

    for (const tool of h.registered) {
      const properties = (tool as { parameters?: { properties?: Record<string, unknown> } }).parameters?.properties;
      expect(Object.keys(properties ?? {}), tool.name).not.toContain('action');
    }
    expect(h.registered.map((tool) => tool.name)).not.toContain('workbench_modules');
  });

  it('缺 id → 抛，并列出可安装的模块（报错要能照做）', async () => {
    const h = harness({ manifests: [unit('issues', 'demo')] });

    await expect(call(h, MODULES_INSTALL_TOOL, {})).rejects.toThrow(/需要一个 id.*可安装的模块：issues/);
  });

  it('install 成功 → 跑了命令，并回一句"已安装"', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x:demo.git' })],
      statuses: { issues: 'missing-plugin' },
    });

    const payload = await call(h, MODULES_INSTALL_TOOL, { id: 'issues' });

    expect(h.fake.commands()).toEqual(["'opencli' plugin install 'git@x:demo.git'"]);
    expect(String(payload.text)).toContain('已安装 issues');
  });

  it('★ 被别的模块共用而留下的那份，要**说出来**（agent 才知道"没删干净"是故意的）', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo'), unit('builds', 'demo')],
      statuses: { issues: 'ok', builds: 'ok' },
    });

    const payload = await call(h, MODULES_UNINSTALL_TOOL, { id: 'issues' });

    expect(String(payload.text)).toContain('builds');
    expect(h.fake.commands()).toEqual([]);
  });

  it('★ 共用依赖只有升级：工具里也只能升（界面上有的动作，工具里必须有 —— ADR-0003）', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x:demo.git' })],
      statuses: { issues: 'missing-commands' },
      statusesAfter: { issues: 'ok' },
    });

    const payload = await call(h, MODULES_UPDATE_DEPENDENCY_TOOL, { id: 'plugin:demo' });

    expect(h.fake.commands()).toEqual(["'opencli' plugin update 'demo'"]);
    expect(String(payload.text)).toContain('已更新共用依赖 plugin:demo');
  });

  it('★ 共用依赖没有 install-dependency（装它是模块那一行的事，用户口径 2026-09-30）', async () => {
    const h = harness({ manifests: [unit('issues', 'demo')], statuses: { issues: 'missing-plugin' } });

    expect(h.registered.map((tool) => tool.name)).not.toContain('workbench_modules_install_dependency');
    await expect(call(h, MODULES_UPDATE_DEPENDENCY_TOOL, { id: 'plugin:demo' })).resolves.toBeDefined();
  });

  it('★ 动用户自己装的 opencli 插件：包名与插件名都认（界面显示的是插件名）', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo')],
      statuses: { issues: 'ok' },
      ledger: ledgerWith([{ pkg: 'opencli-plugin-inventory', name: 'inventory', registry: 'https://r.example/' }]),
      npmLatest: '1.0.25',
    });

    const payload = await call(h, MODULES_UPDATE_PLUGIN_TOOL, { plugin: 'inventory' });

    expect(h.fake.commands().some((line) => line.includes("npm view 'opencli-plugin-inventory'"))).toBe(true);
    expect(String(payload.text)).toContain('已更新 opencli 插件 inventory');
  });

  it('★ update 也是"升它声明的供给"，不是换包', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x:demo.git' })],
      statuses: { issues: 'missing-commands' },
    });

    const payload = await call(h, MODULES_UPDATE_TOOL, { id: 'issues' });

    expect(String(payload.text)).toContain('已更新 issues');
  });

  it('★ 说清这次动了谁的供给（更新前后都要能回答"会不会弄坏"）', async () => {
    const h = harness({
      manifests: [unit('issues', 'inventory'), unit('builds', 'inventory')],
      statuses: { issues: 'ok', builds: 'ok' },
      ledger: ledgerWith([{ pkg: 'opencli-plugin-inventory', name: 'inventory', registry: 'https://r.example/' }]),
      npmLatest: '1.0.25',
      references: { trustworthy: true },
    });

    const payload = await call(h, MODULES_UPDATE_PLUGIN_TOOL, { plugin: 'inventory' });

    expect(String(payload.text)).toContain('issues');
    expect(String(payload.text)).toContain('builds');
    expect(String(payload.text)).toContain('重探');
  });

  it('不给 plugin → 抛一句能照做的（不是"缺 id"）', async () => {
    const h = harness({ manifests: [unit('issues', 'demo')] });

    await expect(call(h, MODULES_UPDATE_PLUGIN_TOOL, {})).rejects.toThrow(/需要一个 plugin/);
    await expect(call(h, MODULES_UNINSTALL_PLUGIN_TOOL, {})).rejects.toThrow(/需要一个 plugin/);
  });

  it('★ 卸掉没人用的那份 → 话里说"文件也删了"', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo')],
      statuses: { issues: 'ok' },
      ledger: ledgerWith([{ pkg: 'opencli-plugin-inventory', name: 'inventory', registry: 'https://r.example/' }]),
      references: { trustworthy: true },
    });

    const payload = await call(h, MODULES_UNINSTALL_PLUGIN_TOOL, { plugin: 'opencli-plugin-inventory' });

    expect(h.fake.commands()).toEqual(["'opencli' plugin uninstall 'inventory'"]);
    expect(payload['removed']).toBe(true);
    expect(String(payload.text)).toContain('文件也删了');
  });

  it('★ 文件留着的那种，要把理由带出来（agent 才知道"没删干净"是故意的）', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo'), unit('builds', 'demo')],
      statuses: { issues: 'ok', builds: 'ok' },
      ledger: ledgerWith([{ pkg: 'opencli-plugin-demo', name: 'demo', registry: 'https://r.example/' }]),
      references: { trustworthy: true },
    });

    const payload = await call(h, MODULES_UNINSTALL_PLUGIN_TOOL, { plugin: 'opencli-plugin-demo' });

    expect(h.fake.commands()).toEqual([]);
    expect(payload['removed']).toBe(false);
    expect(String(payload.text)).toContain('issues');
    expect(String(payload.text)).toContain('还要用它');
  });

  it('★ 没有 tools 服务 → 不注册也不抛（降级）', async () => {
    const ctx = { get: () => undefined, logger: { info: () => {}, warn: () => {} } };
    const market = createMarketService({ manifests: [unit('issues', 'demo')] });

    expect(registerMarketTools(ctx as never, market)).toEqual([]);
  });

  it('没有 shell → 列表照常，动作抛（能看不能装）', async () => {
    const h = harness({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' })],
      statuses: { issues: 'missing-plugin' },
      withShell: false,
    });

    const listed = await call(h, MODULES_LIST_TOOL, {});
    expect(String(listed.text)).toContain('issues');

    await expect(call(h, MODULES_INSTALL_TOOL, { id: 'issues' })).rejects.toThrow(/没有执行缝/);
  });
});

describe('workbench_modules · install-bundle（按 spec 装模块包）', () => {
  const installedModule: InstalledModule = {
    kind: 'module',
    pkg: '@dsh-workbench/module-hello',
    unit: 'hello',
    version: '0.1.2',
  };

  it('不给 spec → 明确告诉他 spec 长什么样（不是"缺 id"）', async () => {
    const h = harness({ manifests: [], bundles: fakeBundles(), installed: () => installedModule });
    await expect(call(h, MODULES_INSTALL_BUNDLE_TOOL, {})).rejects.toThrow(/需要一个 spec/);
    await expect(call(h, MODULES_INSTALL_BUNDLE_TOOL, { spec: '  ' })).rejects.toThrow(/需要一个 spec/);
  });

  it('★ 装成功 → 话里说清"装好了"、模块 unit、以及它要的插件也装上了', async () => {
    const h = harness({
      manifests: [unit('hello', 'demo', { kind: 'git', url: 'git@x:hello.git' })],
      statuses: { hello: 'missing-plugin' },
      bundles: fakeBundles(),
      installed: () => installedModule,
    });

    const payload = await call(h, MODULES_INSTALL_BUNDLE_TOOL, { spec: '@dsh-workbench/module-hello' });

    expect(String(payload.text)).toContain('装好了，已生效');
    expect(String(payload.text)).toContain('hello（@dsh-workbench/module-hello）');
    expect(String(payload.text)).toContain('插件也装上了');
    expect(h.fake.commands()).toEqual(["'opencli' plugin install 'git@x:hello.git'"]);
    expectLossless(payload);
  });

  it('★ 要重启的那种 → 话里说"要重启一次"，不说"已生效"', async () => {
    const h = harness({
      manifests: [],
      bundles: fakeBundles({ install: async () => ({
        application: 'restart-required',
        stage: 'install',
        changed: true,
        target: '@a/b',
        bundle: '@dsh-workbench/module-hello',
      }) }),
      installed: () => installedModule,
    });

    const payload = await call(h, MODULES_INSTALL_BUNDLE_TOOL, { spec: '@a/b' });
    expect(String(payload.text)).toContain('要重启一次');
  });

  it('★ 装进来的不是工作台模块 → 话里直说它不会出现在面板上', async () => {
    const h = harness({
      manifests: [],
      bundles: fakeBundles(),
      installed: () => ({ kind: 'not-module', pkg: '@dsh-workbench/module-hello' }),
    });

    const payload = await call(h, MODULES_INSTALL_BUNDLE_TOOL, { spec: '@dsh-workbench/module-hello' });
    expect(String(payload.text)).toContain('不是工作台模块');
  });

  it('registry 传下去（不填就不传，让管理器用自己配的源）', async () => {
    const seen: unknown[] = [];
    const h = harness({
      manifests: [],
      bundles: fakeBundles({
        install: async (request) => {
          seen.push(request);
          return { application: 'applied', stage: 'install', changed: true, target: request.spec, bundle: 'x' };
        },
      }),
      installed: () => ({ kind: 'unknown', pkg: 'x' }),
    });

    await call(h, MODULES_INSTALL_BUNDLE_TOOL, { spec: 'x', registry: 'https://r.example/' });
    await call(h, MODULES_INSTALL_BUNDLE_TOOL, { spec: 'x', registry: '   ' });

    expect(seen).toEqual([
      { spec: 'x', registry: 'https://r.example/' },
      { spec: 'x' },
    ]);
  });

  it('没有插件管理器 → 抛一句人话（不是静默成功）', async () => {
    const h = harness({ manifests: [] });
    await expect(call(h, MODULES_INSTALL_BUNDLE_TOOL, { spec: 'x' })).rejects.toThrow(/没有插件管理器/);
  });
});
