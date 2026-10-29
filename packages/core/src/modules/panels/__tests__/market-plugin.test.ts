import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
const PLUGIN_MANIFEST_FILE = 'opencli-plugin.json';
import type { BundleChange, BundleInstallRequest } from '@/kernel/contract/bundle-install';
import type { BundleManager, SupplyPort } from '@dsh-workbench/shared/host';
import { createPackageRouter } from '@dsh-workbench/shared/host';
import { installRouted, type BundleInstallDeps } from '../model/market-route';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';

const HOME = '/tmp/wb-market-home/workbench/opencli/home';
const PKG = '@t/plugin-a';
const roots: string[] = [];

function dirOf(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-plugin-'));
  roots.push(root);
  const at = path.join(root, name);
  fs.mkdirSync(at, { recursive: true });
  return at;
}

function put(at: string, file: string, body: unknown): void {
  const target = path.join(at, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
}

function pluginFixture(): string {
  const at = dirOf('plugin-a');
  put(at, 'package.json', { name: PKG, version: '1.0.0' });
  put(at, PLUGIN_MANIFEST_FILE, { name: 'plugina' });
  put(at, 'list.js', 'x');
  return at;
}

function managerOf(): BundleManager {
  return {
    registries: async () => null,
    inspect: async () => null,
    install: async (request: BundleInstallRequest): Promise<BundleChange> => ({
      application: 'applied',
      stage: 'install',
      changed: true,
      target: request.spec,
      bundle: request.spec,
    }),
    remove: async () => null,
    cancel: async () => null,
  };
}

function ledgerAt(root: string): PluginLedger {
  return createPluginLedger({
    store: createWorkspaceStore({ root }),
    home: HOME,
    pluginFiles: { dir: path.join(HOME, '..', 'plugins-npm', 'node_modules'), manifest: PLUGIN_MANIFEST_FILE },
  });
}

function pluginSupply(): SupplyPort {
  const router = createPackageRouter({ manifestFile: 'opencli-plugin.json' });
  return {
    isolatedRoot: () => '/tmp/wb-plugin-runtime',
    isolatedHome: () => '/tmp/wb-plugin-home',
    modules: { isolatedRoot: () => '/tmp/wb-plugin-runtime', isolatedHome: () => '/tmp/wb-plugin-home' },
    packageRouteOf: router.packageRouteOf,
    pluginInstallPlan: (plan: { spec: string; command: string }) => ({
      ok: true,
      commands: [{ line: `'${plan.command}' plugin install '${plan.spec}'` }],
    }),
  } as unknown as SupplyPort;
}

function rig(options: {
  readonly spec: string;
  readonly root: string;
  readonly run?: (ledger: PluginLedger, commands: string[]) => Promise<void>;
}): { deps: BundleInstallDeps; ledger: PluginLedger; commands: string[]; seen: (string | undefined)[] } {
  const ledger = ledgerAt(options.root);
  const commands: string[] = [];
  const seen: (string | undefined)[] = [];
  const deps: BundleInstallDeps = {
    spec: options.spec,
    command: 'opencli',
    supply: pluginSupply(),
    manager: managerOf(),
    ledger,
    runAll: async (steps) => {
      seen.push(ledger.read(PKG)?.package);
      if (options.run !== undefined) {
        await options.run(ledger, commands);
        return;
      }
      for (const step of steps) commands.push(step.line);
    },
    supplyAfter: async () => ({ state: 'no-needs' }),
    rememberSource: async () => {},
  };
  return { deps, ledger, commands, seen };
}

beforeEach(() => {
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('装 opencli 插件：先写台账意图，再让 npm / opencli 落盘', () => {
  it('★ 台账那一笔在下命令之前就写了（崩在中间也不会让刚装的包变成孤儿）', async () => {
    const at = pluginFixture();
    const { deps, ledger, seen } = rig({ spec: at, root: dirOf('store') });

    await installRouted(deps);

    expect(seen).toEqual([PKG]);
    expect(ledger.read(PKG)).toMatchObject({ package: PKG, local: true });
  });

  it('★ 装失败 → 意图回滚（那一笔去掉，文件也不留），错误照旧抛出去', async () => {
    const at = pluginFixture();
    const { deps, ledger, seen } = rig({
      spec: at,
      root: dirOf('store'),
      run: async () => {
        throw new Error('盘写不进去');
      },
    });

    await expect(installRouted(deps)).rejects.toThrow('盘写不进去');

    expect(seen).toEqual([PKG]);
    expect(ledger.read(PKG)).toBeUndefined();
    expect(ledger.list()).toEqual([]);
  });

  it('装完读一次 opencli-plugin.json，把插件名补进那一笔（显示用）', async () => {
    const at = pluginFixture();
    const { deps, ledger } = rig({ spec: at, root: dirOf('store') });

    await installRouted(deps);

    expect(ledger.read(PKG)?.name).toBe('plugina');
  });

  it('都不是的包不写台账（拒了就没有这一笔）', async () => {
    const at = dirOf('plain');
    put(at, 'package.json', { name: '@t/plain' });
    const { deps, ledger } = rig({ spec: at, root: dirOf('store') });

    await installRouted(deps);

    expect(ledger.list()).toEqual([]);
  });
});
