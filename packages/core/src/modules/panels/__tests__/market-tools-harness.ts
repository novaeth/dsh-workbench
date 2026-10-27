import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule, ProfilePackage } from '@dsh-workbench/shared/host';
import type { SupplySource, UnitManifest } from '@dsh-workbench/shared';
import { extensionNeedOf, libNeedOf, needStateOf } from '@dsh-workbench/shared/testing';
import { createMarketService } from '../model/market';
import { resolvePluginSource, selfUpdatePaths } from '@dsh-workbench/adapters-default';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';
import { registerMarketTools } from '../model/market-tools';

export function unit(id: string, plugin: string, sources?: readonly SupplySource[]): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [extensionNeedOf(plugin, { commands: ['x'], ...(sources === undefined ? {} : { sources }) })],
  };
}

export function libUnit(id: string, libName: string): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [
      extensionNeedOf('demo', { commands: ['x'] }),
      libNeedOf(libName, {
        purpose: '发布编排',
        sources: [
          {
            kind: 'npm',
            registryEnv: 'DSH_WORKBENCH_TEST_REGISTRY',
            registryDefault: 'https://registry.example.com/',
          },
        ],
      }),
    ],
  };
}

function installLineOf(sources: readonly SupplySource[] | undefined, name: string): string {
  for (const source of sources ?? []) {
    const resolved = resolvePluginSource(source, process.env, { command: 'opencli', plugin: name });
    if (resolved.ok) return resolved.line;
  }
  return `${quoteShellArg('opencli')} plugin install <${name}源>`;
}

const probeOf =
  (statuses: Readonly<Record<string, string>>, manifests: readonly UnitManifest[]) =>
  async (id: string): Promise<UnitCapability> => {
    const status = (statuses[id] ?? 'ok') as UnitCapability['status'];
    const manifest = manifests.find((one) => one.id === id);
    const needs = (manifest?.needs ?? [extensionNeedOf('demo', { commands: ['x'] })]).map((need) => {
      if (need.kind === 'lib') {
        return needStateOf(need, status === 'ok' ? 'ok' : 'missing', {
          ...(status === 'missing'
            ? { command: `npm i --prefix /libs ${need.name}`, provision: 'ready' as const }
            : {}),
        });
      }
      if (need.kind !== 'extension') return needStateOf(need, 'ok');
      return needStateOf(
        need,
        status === 'ok' ? 'ok' : status === 'outdated' ? 'outdated' : 'missing',
        {
          ...(status === 'missing'
            ? {
                provision: 'ready' as const,
                command: installLineOf(need.sources, need.name),
              }
            : {}),
          ...(status === 'outdated'
            ? { command: `${quoteShellArg('opencli')} plugin update ${quoteShellArg(need.name)}` }
            : {}),
        },
      );
    });
    return { unit: id, status, needs, detail: '假探测' };
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
  statuses?: Readonly<Record<string, string>>;
  statusesAfter?: Readonly<Record<string, string>>;
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
      return probeOf(table, options.manifests)(id);
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
