import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { fakeSeamOf } from './seam-fake';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule, ProfilePackage } from '@dsh-workbench/shared/host';
import type { SupplySource, UnitManifest } from '@dsh-workbench/shared';
import { extensionNeedOf, libNeedOf, needStateOf } from '@dsh-workbench/shared/testing';
import type { SupplyPort } from '@dsh-workbench/shared/host';
import { createReleaseProbe } from '@dsh-workbench/shared/host';
import { createMarketService } from '../model/market';

import { quoteShellArg } from '@dsh-workbench/shared/host';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';
import { registerMarketTools, type MarketSourceGateway } from '../model/market-tools';

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
  const source = sources?.[0];
  if (source === undefined) return `${quoteShellArg('opencli')} plugin install <${name}源>`;
  const spec =
    source.kind === 'git' ? source.url : source.kind === 'local' ? (source.path ?? name) : (source.package ?? name);
  return `${quoteShellArg('opencli')} plugin install ${quoteShellArg(spec)}`;
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
  npmVersions?: readonly string[];
  npmMissing?: readonly string[];
  includePrerelease?: boolean;
  profileName?: string | null;
  marketSources?: MarketSourceGateway;
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
    if (options.npmVersions !== undefined && call.command.includes('versions --json')) {
      return { stdout: JSON.stringify(options.npmVersions) };
    }
    return options.npmLatest !== undefined && call.command.includes('npm view')
      ? { stdout: `${options.npmLatest}\n` }
      : { stdout: '' };
  });
  const selfUpdates: SelfUpdateRequest[] = [];
  const release = createReleaseProbe();
  const supply = {
    afterLibInstall: () => undefined,
    latestVersion: release.latestVersion,
    missingReleaseParts: release.missingReleaseParts,
    probeRelease: release.probeRelease,
    isolatedRoot: () => '/tmp/wb-harness-runtime',
    isolatedHome: () => '/tmp/wb-harness-home',
    modules: { isolatedRoot: () => '/tmp/wb-harness-runtime', isolatedHome: () => '/tmp/wb-harness-home' },
    packageRouteOf: async () => undefined,
    pluginInstallPlan: (plan: { spec: string; command: string }) => ({
      ok: true,
      steps: [
        { kind: 'run', line: `npm i --prefix '/tmp/wb-harness-plugins' '${plan.spec}'` },
        { kind: 'run', line: `'${plan.command}' plugin install '${plan.spec}'` },
      ],
    }),
  } as unknown as SupplyPort;
  const market = createMarketService({
    supply,
    command: 'opencli',
    manifests: options.manifests,
    probe: async (id: string): Promise<UnitCapability> => {
      const after = fake.commands().length > 0;
      const table = after ? (options.statusesAfter ?? options.statuses ?? {}) : (options.statuses ?? {});
      return probeOf(table, options.manifests)(id);
    },
    ...(options.withShell === false ? {} : { seam: fakeSeamOf(fake.shell) }),
    ...(options.bundles === undefined ? {} : { bundles: options.bundles }),
    ...(options.installed === undefined ? {} : { installed: options.installed }),
    ...(options.modules === undefined ? {} : { modules: options.modules }),
    ...(options.workbench === undefined ? {} : { workbench: options.workbench }),
    ...(options.ledger === undefined ? {} : { ledger: options.ledger }),
    ...(references === undefined ? {} : { references: () => ({ ...references, unreadable: [] }) }),
    dshHome: () => '/tmp/dsh-home',
    profileName: () => (options.profileName === undefined ? 'workbench' : options.profileName),
    ...(options.includePrerelease === undefined
      ? {}
      : { includePrerelease: () => options.includePrerelease === true }),
    selfUpdate: (request) => {
      selfUpdates.push(request);
      return { started: true, paths: selfUpdatePathsOf(request.dshHome), forward: '' };
    },
  });
  return {
    registered,
    fake,
    disposers: registerMarketTools(ctx as never, market, options.marketSources),
    selfUpdates,
  };
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

export function selfUpdatePathsOf(dshHome: string): {
  dir: string;
  planFile: string;
  marker: string;
  log: string;
  versionsDir: string;
} {
  const dir = path.join(dshHome, 'workbench');
  return {
    dir,
    planFile: path.join(dir, 'self-update-plan.json'),
    marker: path.join(dir, 'self-update.json'),
    log: path.join(dir, 'self-update.log'),
    versionsDir: path.join(dir, 'versions'),
  };
}
