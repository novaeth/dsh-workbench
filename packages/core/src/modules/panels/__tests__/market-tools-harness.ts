import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule, ProfilePackage } from '@dsh-workbench/shared/host';
import type { PluginSource, UnitManifest } from '@dsh-workbench/shared';
import { createMarketService } from '../model/market';
import { selfUpdatePaths } from '@dsh-workbench/adapters-default';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';
import { registerMarketTools } from '../model/market-tools';

export function unit(id: string, plugin: string, source?: PluginSource): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    env: {
      command: 'opencli',
      plugins: [{ name: plugin, commands: ['x'], ...(source === undefined ? {} : { installSource: source }) }],
    },
  };
}

export function libUnit(id: string, libName: string): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    env: {
      command: 'opencli',
      plugins: [{ name: 'demo', commands: ['x'] }],
      libs: [
        {
          name: libName,
          registryEnv: 'DSH_WORKBENCH_TEST_REGISTRY',
          registryDefault: 'https://registry.example.com/',
          purpose: '发布编排',
        },
      ],
    },
  };
}

const probeOf =
  (statuses: Readonly<Record<string, UnitCapability['status']>>) =>
  async (id: string): Promise<UnitCapability> => {
    const status = statuses[id] ?? 'ok';
    return {
      unit: id,
      status,
      required: [],
      missing: [],
      detail: '假探测',
      plugins: [
        {
          name: 'demo',
          status: status === 'missing-plugin' ? 'missing' : status === 'missing-commands' ? 'outdated' : 'ok',
          missing: [],
        },
      ],
    };
  };

const roots: string[] = [];

export function cleanupRoots(): void {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
}

export function ledgerWith(entries: readonly { pkg: string; name?: string; registry?: string }[]): PluginLedger {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-tools-'));
  roots.push(root);
  const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-tools-home' });
  for (const entry of entries) {
    ledger.intend({
      package: entry.pkg,
      ...(entry.registry === undefined ? {} : { registry: entry.registry }),
    });
    if (entry.name !== undefined) ledger.complete(entry.pkg, entry.name);
  }
  return ledger;
}

export function harness(options: {
  manifests: UnitManifest[];
  statuses?: Readonly<Record<string, UnitCapability['status']>>;
  statusesAfter?: Readonly<Record<string, UnitCapability['status']>>;
  withShell?: boolean;
  bundles?: BundleManager;
  installed?: (pkg: string) => InstalledModule;
  modules?: () => readonly ProfileModule[];
  workbench?: (pkg: string) => ProfilePackage | undefined;
  ledger?: PluginLedger;
  references?: { readonly trustworthy: boolean };
  npmLatest?: string;
  npmMissing?: readonly string[];
  profileName?: string | null;
}) {
  const references = options.references;
  const registered: Array<{ name: string; execute: (args: unknown) => Promise<unknown> }> = [];
  const ctx = {
    get: (key: string) =>
      key === 'tools'
        ? {
            register(definition: { name: string; execute: (args: unknown) => Promise<unknown> }) {
              registered.push(definition);
              return () => {};
            },
          }
        : undefined,
    logger: { info: () => {}, warn: () => {} },
  };
  const fake = createFakeShell((call) => {
    if ((options.npmMissing ?? []).some((name) => call.command.includes(name))) {
      return { exitCode: 1, stdout: '' };
    }
    return options.npmLatest !== undefined && call.command.includes('npm view')
      ? { stdout: `${options.npmLatest}\n` }
      : { stdout: '' };
  });
  const selfUpdates: SelfUpdateRequest[] = [];
  const market = createMarketService({
    manifests: options.manifests,
    probe: async (id: string): Promise<UnitCapability> => {
      const after = fake.commands().length > 0;
      const table = after ? (options.statusesAfter ?? options.statuses ?? {}) : (options.statuses ?? {});
      return probeOf(table)(id);
    },
    ...(options.withShell === false ? {} : { shell: fake.shell }),
    ...(options.bundles === undefined ? {} : { bundles: options.bundles }),
    ...(options.installed === undefined ? {} : { installed: options.installed }),
    ...(options.modules === undefined ? {} : { modules: options.modules }),
    ...(options.workbench === undefined ? {} : { workbench: options.workbench }),
    ...(options.ledger === undefined ? {} : { ledger: options.ledger }),
    ...(references === undefined ? {} : { references: () => ({ ...references, unreadable: [] }) }),
    dshHome: () => '/tmp/dsh-home',
    profileName: () => (options.profileName === undefined ? 'workbench' : options.profileName),
    selfUpdate: (request) => {
      selfUpdates.push(request);
      return { started: true, paths: selfUpdatePaths(request.dshHome), forward: '' };
    },
  });
  return { registered, fake, disposers: registerMarketTools(ctx as never, market), selfUpdates };
}

export function fakeBundles(over: Partial<BundleManager> = {}): BundleManager {
  return {
    registries: async () => null,
    inspect: async () => null,
    install: async (request) => ({
      application: 'applied',
      stage: 'install',
      changed: true,
      target: request.spec,
      bundle: '@dsh-workbench/module-hello',
    }),
    remove: async (name) => ({ application: 'applied', stage: 'remove', changed: true, target: name }),
    cancel: async () => 'cancelled',
    ...over,
  };
}

export async function call(
  h: ReturnType<typeof harness>,
  name: string,
  args: unknown = {},
): Promise<Record<string, unknown>> {
  const tool = h.registered.find((one) => one.name === name);
  if (tool === undefined) {
    throw new Error(`工具没注册：${name}（注册了：${h.registered.map((one) => one.name).join(', ')}）`);
  }
  return (await tool.execute(args)) as Record<string, unknown>;
}
