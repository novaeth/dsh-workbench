import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createWorkspaceStore, PROVISION_ACTIONS } from '@dsh-workbench/shared/host';
import type { ProvisionAction, ProvisionRequest } from '@dsh-workbench/shared/host';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { BundleManager } from '@/shared/api/host/bundle-manager';
import type { UnitCapability } from '@/shared/api/host/probe-units';
import { createMarketService } from '../model/market';
import { dispatchMarket } from '../model/market-dispatch';
import { createPluginLedger } from '../model/plugin-ledger';
import { selfUpdatePaths } from '@/shared/api/host/self-update';

function unit(id: string): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    env: {
      command: 'opencli',
      plugins: [{ name: 'demo', commands: ['x'], installSource: { kind: 'git', url: 'git@x:demo.git' } }],
    },
  };
}

const probeOf = (status: UnitCapability['status']) => async (id: string): Promise<UnitCapability> => ({
  unit: id,
  status,
  required: [],
  missing: [],
  detail: '假探测',
  plugins: [{ name: 'demo', status: status === 'missing-plugin' ? 'missing' : 'ok', missing: [] }],
});

function fakeBundles(): BundleManager {
  return {
    registries: async () => null,
    inspect: async () => null,
    install: async (request) => ({
      application: 'applied',
      stage: 'install',
      changed: true,
      target: request.spec,
      bundle: request.spec,
    }),
    remove: async (name) => ({ application: 'applied', stage: 'remove', changed: true, target: name }),
    cancel: async () => 'cancelled',
  };
}

const cases: Record<ProvisionAction, ProvisionRequest> = {
  install: { action: 'install', unit: 'issues' },
  update: { action: 'update', unit: 'issues' },
  uninstall: { action: 'uninstall', unit: 'issues' },
  'install-bundle': { action: 'install-bundle', spec: '@a/b' },
  'update-bundle': { action: 'update-bundle', unit: 'issues' },
  'remove-bundle': { action: 'remove-bundle', name: '@a/b' },
  'cancel-install': { action: 'cancel-install', requestId: 'req-1' },
  'update-dependency': { action: 'update-dependency', id: 'plugin:demo' },
  'update-plugin': { action: 'update-plugin', name: '@a/plugin' },
  'uninstall-plugin': { action: 'uninstall-plugin', name: '@a/plugin' },
  'update-workbench': { action: 'update-workbench', name: '@dsh-workbench/core' },
};

describe('市场动作分发（HTTP 通道与 agent 工具共用同一套动作）', () => {
  it('按 action 分发：老的 install 照旧走供给安装', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues')],
      probe: probeOf('missing-plugin'),
      shell: fake.shell,
    });

    const result = await dispatchMarket(market, { action: 'install', unit: 'issues' });

    expect(result).toMatchObject({ ok: true, action: 'install', module: { unit: 'issues' } });
    expect(fake.commands()).toHaveLength(1);
  });

  it('★ 声明过的**每一个** action 都分得出去（加动作却忘了 dispatch 就会红）', async () => {
    for (const action of PROVISION_ACTIONS) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-dispatch-'));
      const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
      ledger.intend({ package: '@a/plugin', registry: 'https://r.example/' });
      const fake = createFakeShell((call) =>
        call.command.startsWith('npm view') ? { stdout: '1.0.1\n' } : { stdout: '' },
      );
      const market = createMarketService({
        manifests: [unit('issues')],
        probe: probeOf('missing-plugin'),
        shell: fake.shell,
        bundles: fakeBundles(),
        installed: (pkg) => ({ kind: 'unknown', pkg }),
        modules: () => [{ pkg: '@a/issues', unit: 'issues', version: '0.1.0' }],
        workbench: (pkg) => ({ pkg, version: '0.1.0' }),
        ledger,
        dshHome: () => '/tmp/dsh-home',
        profileName: () => 'workbench',
        selfUpdate: (request) => ({
          started: true,
          paths: selfUpdatePaths(request.dshHome),
          forward: '',
        }),
      });
      const result = await dispatchMarket(market, cases[action]);
      fs.rmSync(root, { recursive: true, force: true });

      expect(result.ok).toBe(true);
      expect(result.action).toBe(action);
      if (action === 'update-dependency') expect(result).toMatchObject({ shared: expect.any(Array) });
      else if (action === 'install-bundle') expect(result).toMatchObject({ module: { kind: 'unknown' } });
      else if (action === 'update-bundle') expect(result).toMatchObject({ change: { stage: 'install' } });
      else if (action === 'update-workbench') expect(result).toMatchObject({ change: { stage: 'install' } });
      else if (action === 'remove-bundle') expect(result).toMatchObject({ change: { stage: 'remove' } });
      else if (action === 'cancel-install') expect(result).toMatchObject({ cancellation: 'cancelled' });
      else if (action === 'update-plugin') expect(result).toEqual({ ok: true, action });
      else if (action === 'uninstall-plugin') {
        expect(result).toMatchObject({ ok: true, action, removed: false, kept: { kind: 'unnamed' } });
      } else expect(result).toMatchObject({ module: { unit: 'issues' } });
    }
  });

  it('★ 工作台那条路只认工作台自己那个包名（别的包不许借它进这台机器）', async () => {
    const market = createMarketService({
      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
      dshHome: () => '/tmp/dsh-home',
      profileName: () => 'workbench',
      selfUpdate: (request) => ({ started: true, paths: selfUpdatePaths(request.dshHome), forward: '' }),
    });

    await expect(dispatchMarket(market, { action: 'update-workbench', name: 'left-pad' })).rejects.toThrow(
      /只更新工作台自己那一份/,
    );
    expect(await dispatchMarket(market, { action: 'update-workbench', name: '' })).toMatchObject({
      ok: true,
      action: 'update-workbench',
      change: { stage: 'install' },
    });
  });

  it('★ 读不到 profile 里装的那份 / 读出来是本仓那份 → 抛一句能照做的（不假装升了）', async () => {
    const missing = createMarketService({ manifests: [], bundles: fakeBundles(), workbench: () => undefined });
    const local = createMarketService({
      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18', local: true }),
    });

    await expect(dispatchMarket(missing, { action: 'update-workbench', name: '' })).rejects.toThrow(/读不到/);
    await expect(dispatchMarket(local, { action: 'update-workbench', name: '' })).rejects.toThrow(/本仓/);
  });

  it('装模块包：registry 与 approvedBuilds 从请求体传到管理器（HTTP 只做形状校验）', async () => {
    const seen: unknown[] = [];
    const market = createMarketService({
      manifests: [],
      bundles: {
        ...fakeBundles(),
        install: async (request) => {
          seen.push(request);
          return { application: 'applied', stage: 'install', changed: true, target: request.spec };
        },
      },
      installed: (pkg) => ({ kind: 'unknown', pkg }),
    });

    const result = await dispatchMarket(market, {
      action: 'install-bundle',
      spec: '@a/b@1.2.3',
      registry: 'https://r.example/',
      approvedBuilds: ['esbuild'],
    });

    expect(seen).toEqual([{ spec: '@a/b@1.2.3', registry: 'https://r.example/', approvedBuilds: ['esbuild'] }]);
    expect(result).toMatchObject({ ok: true, action: 'install-bundle', change: { application: 'applied' } });
  });
});
