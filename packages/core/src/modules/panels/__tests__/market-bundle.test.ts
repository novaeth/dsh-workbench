import { describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { libNeedOf } from '@dsh-workbench/shared/testing';
import type { NeedState, UnitManifest } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import { createMarketService } from '../model/market';

const GIT = { kind: 'git' as const, url: 'git@x:plugin.git' };

function unit(id: string, plugin = 'demo'): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [{ kind: 'extension', runtime: 'opencli', name: plugin, commands: ['x'], purpose: '测试', sources: [GIT] }],
  };
}

const plainUnit: UnitManifest = {
  id: 'hello',
  titleKey: 'hello.mine', card: { order: 10 },
  tools: [],
  host: { inject: [] },
};

const needState = (name: string, status: NeedState['status'], extra: Partial<NeedState> = {}): NeedState => ({
  id: `extension:${name}`,
  kind: 'extension',
  name,
  status,
  detail: '假探测',
  ...extra,
});

const capability = (
  status: UnitCapability['status'],
  needs?: readonly NeedState[],
): UnitCapability => ({
  unit: 'issues',
  status,
  needs: [...(needs ?? [])],
  detail: '假探测',
});

const missingPlugin = capability('missing', [
  needState('demo', 'missing', { provision: 'ready', command: "'opencli' plugin install 'git@x:plugin.git'" }),
]);

const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'applied',
  stage: 'install',
  changed: true,
  target: '@dsh-workbench/module-issues',
  bundle: '@dsh-workbench/module-issues',
  ...over,
});

function bundlesOf(over: Partial<BundleManager> = {}): BundleManager {
  return {
    registries: async () => null,
    inspect: async () => null,
    install: async () => change(),
    remove: async () => change({ stage: 'remove' }),
    cancel: async () => 'cancelled',
    ...over,
  };
}

const isModule = (unitId: string): InstalledModule => ({
  kind: 'module',
  pkg: '@dsh-workbench/module-issues',
  unit: unitId,
  version: '0.1.0',
});

const notModule: InstalledModule = { kind: 'not-module', pkg: '@dsh-workbench/module-issues' };
const unknown: InstalledModule = { kind: 'unknown', pkg: '@dsh-workbench/module-issues' };

describe('市场装模块包：装前装后的护栏与连带供给', () => {
  it('没有插件管理器 → 说不清就别说，直接抛一句人话', async () => {
    const market = createMarketService({ command: 'opencli', manifests: [] });
    await expect(market.installBundle('@a/b')).rejects.toThrow(/没有插件管理器/);
  });

  it('管理器回的东西看不懂 → 抛，不编一个"装好了"', async () => {
    const market = createMarketService({ command: 'opencli', manifests: [], bundles: bundlesOf({ install: async () => null }) });
    await expect(market.installBundle('@a/b')).rejects.toThrow(/看不懂/);
  });

  it('spec / registry / approvedBuilds / requestId 原样透传给管理器', async () => {
    const seen: unknown[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async (request) => {
          seen.push(request);
          return change();
        },
      }),
      installed: () => unknown,
    });
    await market.installBundle('@a/b@1.2.3', {
      registry: 'https://r.example/',
      approvedBuilds: ['esbuild'],
      requestId: 'req-1',
    });
    expect(seen).toEqual([
      { spec: '@a/b@1.2.3', registry: 'https://r.example/', requestId: 'req-1', approvedBuilds: ['esbuild'] },
    ]);
  });

  it('★ 装好一个工作台模块，连带把它声明的 opencli 供给也装上', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => missingPlugin,
      shell: fake.shell,
      bundles: bundlesOf(),
      installed: () => isModule('issues'),
    });
    const outcome = await market.installBundle('@dsh-workbench/module-issues');
    expect(outcome.module).toEqual(isModule('issues'));
    expect(outcome.supply).toMatchObject({ state: 'installed', entry: { unit: 'issues' } });
    expect(fake.commands()).toEqual(["'opencli' plugin install 'git@x:plugin.git'"]);
  });

  it('★ 装进来的不是工作台模块 → 说清是 not-a-module（界面据此提示 + 给「移除」）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => missingPlugin,
      shell: fake.shell,
      bundles: bundlesOf(),
      installed: () => notModule,
    });
    const outcome = await market.installBundle('@dsh-workbench/module-issues');
    expect(outcome.supply).toEqual({ state: 'not-a-module' });
    expect(fake.commands()).toEqual([]);
  });

  it('是工作台模块但没声明任何外部供给 → no-needs（不问、不装）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [plainUnit],
      shell: fake.shell,
      bundles: bundlesOf(),
      installed: () => ({ kind: 'module', pkg: 'x', unit: 'hello', version: '0.1.0' }),
    });
    expect((await market.installBundle('x')).supply).toEqual({ state: 'no-needs' });
    expect(fake.commands()).toEqual([]);
  });

  it('★ 要重启的那种装法：模块还没进花名册 → pending-restart（别假装它已经能用）', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({ install: async () => change({ application: 'restart-required' }) }),
      installed: () => isModule('issues'),
    });
    expect((await market.installBundle('@a/b')).supply).toEqual({ state: 'pending-restart' });
  });

  it('供给装不上 → failed 带原因，不把整个安装说成失败', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => missingPlugin,
      shell: undefined,
      bundles: bundlesOf(),
      installed: () => isModule('issues'),
    });
    const outcome = await market.installBundle('@a/b');
    expect(outcome.supply).toMatchObject({ state: 'failed' });
    expect(outcome.change.application).toBe('applied');
  });

  it('管理器没给包名时，按 spec 去掉版本号当包名（@scope/name@1.2.3 → @scope/name）', async () => {
    const asked: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({ install: async () => change({ bundle: undefined }) }),
      installed: (pkg) => {
        asked.push(pkg);
        return unknown;
      },
    });
    await market.installBundle('@scope/name@1.2.3');
    await market.installBundle('@scope/name');
    expect(asked).toEqual(['@scope/name', '@scope/name']);
  });
});

describe('市场卸模块包：先记下它要什么，卸成功再按引用计数清供给', () => {
  it('★ 卸成功 → 卸掉它的供给，并通知面板放开它', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const onUninstalled = vi.fn();
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => capability('ok'),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      bundles: bundlesOf(),
      installed: () => isModule('issues'),
      onUninstalled,
    });
    const outcome = await market.removeBundle('@dsh-workbench/module-issues');
    expect(outcome.change.stage).toBe('remove');
    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
    expect(onUninstalled).toHaveBeenCalledWith('issues');
  });

  it('★ 卸失败 → 一根手指都不碰它的供给（否则模块还在、插件先没了）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const onUninstalled = vi.fn();
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => capability('ok'),
      shell: fake.shell,
      bundles: bundlesOf({ remove: async () => change({ stage: 'remove', application: 'failed' }) }),
      installed: () => isModule('issues'),
      onUninstalled,
    });
    const outcome = await market.removeBundle('@dsh-workbench/module-issues');
    expect(outcome.keptFor).toEqual([]);
    expect(fake.commands()).toEqual([]);
    expect(onUninstalled).not.toHaveBeenCalled();
  });

  it('卸的包根本不是工作台模块 → 只卸包，不去猜它的供给', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => capability('ok'),
      shell: fake.shell,
      bundles: bundlesOf(),
      installed: () => notModule,
    });
    expect((await market.removeBundle('@a/b')).keptFor).toEqual([]);
    expect(fake.commands()).toEqual([]);
  });

  it('★ 供给被别的模块共用 → 记进 keptFor，不卸（引用计数照旧）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues'), unit('demo-other')],
      probe: async () => capability('ok'),
      shell: fake.shell,
      bundles: bundlesOf(),
      installed: () => isModule('issues'),
      isReleased: () => false,
    });
    const outcome = await market.removeBundle('@a/b');
    expect(outcome.keptFor).toEqual(['demo-other']);
    expect(fake.commands()).toEqual([]);
  });

  it('★ 卸一个模块会整份 profile 重载（旧册子清空）—— 共用的插件不能跟着没', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    let live: readonly UnitManifest[] = [unit('issues'), unit('demo-other')];
    const market = createMarketService({

      command: 'opencli',      manifests: live,
      manifestsNow: () => live,
      probe: async () => capability('ok'),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      bundles: bundlesOf({
        remove: async () => {
          live = [];
          return change({ stage: 'remove' });
        },
      }),
      installed: () => isModule('issues'),
      isReleased: () => false,
    });

    const outcome = await market.removeBundle('@dsh-workbench/module-issues');

    expect(outcome.keptFor).toEqual(['demo-other']);
    expect(fake.commands()).toEqual([]);
  });

  it('★ 同上，共用的 lib 也不能跟着没（npm 装在共享 prefix 的那份）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const LIB = libNeedOf('opencli-workflow', {
      purpose: '编排',
      sources: [{ kind: 'npm', registryEnv: 'DSH_WB_TEST_REGISTRY', registryDefault: 'https://r.example/' }],
    });
    const libUnit = (id: string): UnitManifest => ({
      id,
      titleKey: `${id}.mine`, card: { order: 10 },
      tools: [],
      host: { inject: [] },
      needs: [LIB],
    });
    let live: readonly UnitManifest[] = [libUnit('cmdb'), libUnit('argo')];
    const market = createMarketService({

      command: 'opencli',      manifests: live,
      manifestsNow: () => live,
      probe: async () => capability('ok'),
      shell: fake.shell,
      bundles: bundlesOf({
        remove: async () => {
          live = [];
          return change({ stage: 'remove' });
        },
      }),
      installed: () => isModule('cmdb'),
      isReleased: () => false,
    });

    const outcome = await market.removeBundle('@dsh-workbench/module-issues');

    expect(outcome.keptFor).toEqual(['argo']);
    expect(fake.commands()).toEqual([]);
  });

  it('取消：照抄管理器的三种取值', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({ cancel: async () => 'too-late' }),
    });
    expect(await market.cancelInstall('req-1')).toBe('too-late');
  });
});

describe('列表那行的「卸载」：已出包的模块走真卸包', () => {
  const mod = { pkg: '@dsh-workbench/module-issues', unit: 'issues', version: '0.1.0' };

  it('★ 出过包的模块 → 先记下条目与供给，再 removeBundle，卸完按引用计数清供给', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const onUninstalled = vi.fn();
    const removed: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => capability('ok'),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      bundles: bundlesOf({
        remove: async (name) => {
          removed.push(name);
          return change({ stage: 'remove' });
        },
      }),
      installed: () => isModule('issues'),
      modules: () => [mod],
      onUninstalled,
    });

    const outcome = await market.uninstall('issues');

    expect(removed).toEqual(['@dsh-workbench/module-issues']);
    expect(outcome.entry.capability.released).toBe(true);
    expect(outcome.change?.stage).toBe('remove');
    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
    expect(onUninstalled).toHaveBeenCalledWith('issues');
  });

  it('★ 包没卸成 → 退回原条目、不碰供给、也不标记"卸过"', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const onUninstalled = vi.fn();
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => capability('ok'),
      shell: fake.shell,
      bundles: bundlesOf({ remove: async () => change({ stage: 'remove', application: 'failed' }) }),
      installed: () => isModule('issues'),
      modules: () => [mod],
      onUninstalled,
    });

    const outcome = await market.uninstall('issues');

    expect(outcome.entry.capability.released).toBeUndefined();
    expect(outcome.keptFor).toEqual([]);
    expect(fake.commands()).toEqual([]);
    expect(onUninstalled).not.toHaveBeenCalled();
  });

  it('没出包的老模块（花名册里查不到包名）→ 走老路：清供给 + 标记，不碰管理器', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const removed: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async () => capability('ok'),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      bundles: bundlesOf({
        remove: async (name) => {
          removed.push(name);
          return change({ stage: 'remove' });
        },
      }),
      modules: () => [],
    });

    const outcome = await market.uninstall('issues');

    expect(removed).toEqual([]);
    expect(outcome.entry.capability.released).toBe(true);
    expect(outcome.change).toBeUndefined();
    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
  });
});
