import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createWorkspaceStore, PROVISION_ACTIONS } from '@dsh-workbench/shared/host';
import type { ProvisionAction, ProvisionRequest } from '@dsh-workbench/shared/host';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import { createMarketService } from '../model/market';
import { dispatchMarket } from '../model/market-dispatch';
import { createPluginLedger } from '../model/plugin-ledger';
import type { SupplyPort } from '@dsh-workbench/shared/host';
import { createPackageRouter, createReleaseProbe } from '@dsh-workbench/shared/host';
import { selfUpdatePathsOf } from './market-tools-harness';

function pluginSupply(): SupplyPort {
  const release = createReleaseProbe();
  const router = createPackageRouter({ manifestFile: 'opencli-plugin.json' });
  return {
    afterLibInstall: () => undefined,
    latestVersion: release.latestVersion,
    missingReleaseParts: release.missingReleaseParts,
    probeRelease: release.probeRelease,
    isolatedRoot: () => '/tmp/wb-dispatch-runtime',
    isolatedHome: () => '/tmp/wb-dispatch-home',
    modules: { isolatedRoot: () => '/tmp/wb-dispatch-runtime', isolatedHome: () => '/tmp/wb-dispatch-home' },
    packageRouteOf: router.packageRouteOf,
    pluginInstallPlan: (plan: { spec: string; command: string }) => ({
      ok: true,
      commands: [
        { line: `npm i --prefix '/tmp/wb-dispatch-plugins' '${plan.spec}'` },
        { line: `'${plan.command}' plugin install '${plan.spec}'` },
      ],
    }),
  } as unknown as SupplyPort;
}

function unit(id: string): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [
      {
        kind: 'extension',
        runtime: 'opencli',
        name: 'demo',
        commands: ['x'],
        purpose: '测试',
        sources: [{ kind: 'git', url: 'git@x:demo.git' }],
      },
    ],
  };
}

const probeOf = (status: string) => async (id: string): Promise<UnitCapability> => {
  const mapped = status as UnitCapability['status'];
  return {
    unit: id,
    status: mapped,
    needs: [
      {
        id: 'extension:demo',
        kind: 'extension',
        name: 'demo',
        status: mapped === 'ok' ? 'ok' : mapped === 'outdated' ? 'outdated' : 'missing',
        detail: '假探测',
        ...(mapped === 'missing'
          ? { install: 'ready' as const, command: "'opencli' plugin install 'git@x:demo.git'" }
          : {}),
        ...(mapped === 'outdated' ? { command: "'opencli' plugin update 'demo'" } : {}),
      },
    ],
    detail: '假探测',
  };
};

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
  'install-version': { action: 'install-version', spec: '@a/b@0.1.1' },
  'update-bundle': { action: 'update-bundle', unit: 'issues' },
  'remove-bundle': { action: 'remove-bundle', name: '@a/b' },
  'cancel-install': { action: 'cancel-install', requestId: 'req-1' },
  'update-dependency': { action: 'update-dependency', id: 'extension:demo' },
  'update-plugin': { action: 'update-plugin', name: '@a/plugin' },
  'uninstall-plugin': { action: 'uninstall-plugin', name: '@a/plugin' },
  'update-workbench': { action: 'update-workbench', name: '@dsh-workbench/core' },
  'migrate-workbench': { action: 'migrate-workbench', name: '@dsh-workbench/core' },
  'dismiss-followup': { action: 'dismiss-followup', id: 'data-root-migration' },
};

describe('市场动作分发（HTTP 通道与 agent 工具共用同一套动作）', () => {
  it('按 action 分发：老的 install 照旧走供给安装', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeOf('missing'),
      shell: fake.shell,
    });

    const result = await dispatchMarket(market, { action: 'install', unit: 'issues' });

    expect(result).toMatchObject({ ok: true, action: 'install', module: { unit: 'issues' } });
    expect(fake.commands()).toHaveLength(1);
  });

  it('★ 声明过的**每一个** action 都分得出去（加动作却忘了 dispatch 就会红）', { timeout: 60000 }, async () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-dispatch-home-'));
    const scriptDir = path.join(
      homeRoot,
      'profiles',
      'workbench',
      'node_modules',
      '@dsh-workbench',
      'core',
      'scripts',
    );
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.writeFileSync(path.join(scriptDir, 'share-data-root.mjs'), '', 'utf8');
    const previousHome = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(homeRoot, 'workbench');
    for (const action of PROVISION_ACTIONS) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-dispatch-'));
      const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
      ledger.intend({ package: '@a/plugin', registry: 'https://r.example/' });
      const fake = createFakeShell((call) =>
        call.command.startsWith('npm view')
          ? { stdout: '1.0.1\n' }
          : call.command.includes('share-data-root.mjs')
            ? { stdout: '迁移完成：新增 2 个项目，补了 0 个文件；旧目录保留。\n' }
            : { stdout: '' },
      );
      const market = createMarketService({
        supply: pluginSupply(),
      command: 'opencli',        manifests: [unit('issues')],
        probe: probeOf('missing'),
        shell: fake.shell,
        bundles: fakeBundles(),
        installed: (pkg) => ({ kind: 'unknown', pkg }),
        modules: () => [{ pkg: '@a/issues', unit: 'issues', version: '0.1.0' }],
        workbench: (pkg) => ({ pkg, version: '0.1.0' }),
        ledger,
        dshHome: () => homeRoot,
        profileName: () => 'workbench',
        runMigration: async () => ({
          exitCode: 0,
          stdout: '迁移完成：新增 2 个项目，补了 0 个文件；旧目录保留。\n',
          stderr: '',
        }),
        selfUpdate: (request) => ({
          started: true,
          paths: selfUpdatePathsOf(request.dshHome),
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
      else if (action === 'install-version') {
        expect(result).toMatchObject({ change: { stage: 'install' }, module: { kind: 'unknown' } });
      }
      else if (action === 'uninstall-plugin') {
        expect(result).toMatchObject({ ok: true, action, removed: false, kept: { kind: 'unnamed' } });
      } else if (action === 'migrate-workbench') {
        expect(result).toMatchObject({ ok: true, action, added: 2, files: 0 });
      } else if (action === 'dismiss-followup') {
        expect(result).toEqual({ ok: true, action });
      } else expect(result).toMatchObject({ module: { unit: 'issues' } });
    }
    if (previousHome === undefined) delete process.env.DSH_WORKBENCH_HOME;
    else process.env.DSH_WORKBENCH_HOME = previousHome;
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });

  it('★ 工作台那条路只认工作台自己那个包名（别的包不许借它进这台机器）', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
      dshHome: () => '/tmp/dsh-home',
      profileName: () => 'workbench',
      selfUpdate: (request) => ({ started: true, paths: selfUpdatePathsOf(request.dshHome), forward: '' }),
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

  it('★ 读不到 profile 里装的那份 / 读出来是源码目录那份 → 抛一句能照做的（不假装升了）', async () => {
    const missing = createMarketService({ command: 'opencli', manifests: [], bundles: fakeBundles(), workbench: () => undefined });
    const local = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18', local: true }),
    });

    await expect(dispatchMarket(missing, { action: 'update-workbench', name: '' })).rejects.toThrow(/读不到/);
    await expect(dispatchMarket(local, { action: 'update-workbench', name: '' })).rejects.toThrow(/源码目录/);
  });

  it('装模块包：registry 与 approvedBuilds 从请求体传到管理器（HTTP 只做形状校验）', async () => {
    const seen: unknown[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [],
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
