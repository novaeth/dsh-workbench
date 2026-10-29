import type { DshShell } from '@dsh-workbench/shared';
import type { PluginSourceCommand } from '@dsh-workbench/shared/host';
import type { BundleChange, BundleInstalledPlugin } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import { refusalReason, splitNpmSpec } from '@dsh-workbench/shared/host';
import { requireSupply, localDirOf, type SupplyPort } from '@dsh-workbench/shared/host';
import { sourceProblemText } from './market-dependency';
import { pluginNameOf } from './plugin-name';
import type { PluginLedger } from './plugin-ledger';
import type { BundleInstallOptions, BundleInstallOutcome, BundleSupply } from './market-types';

export interface BundleInstallDeps {
  readonly spec: string;
  readonly options?: BundleInstallOptions | undefined;
  readonly registry?: string | undefined;
  readonly command: string;
  readonly shell?: DshShell | undefined;
  readonly supply?: SupplyPort | undefined;
  readonly manager: BundleManager;
  readonly installed?: ((pkg: string) => InstalledModule) | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly ledger?: PluginLedger | undefined;
  readonly runAll: (commands: readonly PluginSourceCommand[]) => Promise<void>;
  readonly supplyAfter: (module: InstalledModule, change: BundleChange) => Promise<BundleSupply>;
  readonly rememberSource: (
    manager: BundleManager,
    pkg: string,
    registry: string | undefined,
    version?: string | undefined,
  ) => Promise<void>;
  readonly remove?: ((pkg: string) => Promise<BundleChange>) | undefined;
}

function packageNameInPath(path: string): string | undefined {
  const parts = path.split('/').filter((part) => part !== '');
  const last = parts[parts.length - 1];
  if (last === undefined || last === '') return undefined;
  const parent = parts[parts.length - 2];
  return parent !== undefined && parent.startsWith('@') ? `${parent}/${last}` : last;
}

export function bundleNameOf(change: BundleChange, spec: string): string {
  if (change.bundle !== undefined && change.bundle !== '') return change.bundle;
  const at = spec.indexOf('&path:');
  if (at !== -1) {
    const inPath = packageNameInPath(spec.slice(at + '&path:'.length));
    if (inPath !== undefined) return inPath;
  }
  const version = spec.lastIndexOf('@');
  return version > 0 ? spec.slice(0, version) : spec;
}

function installedPluginName(spec: string, pkg: string): string | undefined {
  const local = localDirOf(spec);
  return pluginNameOf(local === undefined ? { package: pkg } : { package: local, local: true });
}

function outcomeOf(
  deps: BundleInstallDeps,
  pkg: string,
  change: BundleChange,
  plugin?: BundleInstalledPlugin,
): BundleInstallOutcome {
  return {
    change,
    module: deps.installed?.(pkg) ?? { kind: 'unknown', pkg },
    supply: { state: 'no-needs' },
    ...(plugin === undefined ? {} : { plugin }),
  };
}

export async function installDshBundle(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options?: BundleInstallOptions,
): Promise<BundleInstallOutcome> {
  return settle(deps, spec, options, await installOnce(deps, spec, options));
}

export type ReplaceBundleDeps = Omit<BundleInstallDeps, 'spec' | 'options' | 'remove'> & {
  readonly remove: (pkg: string) => Promise<BundleChange>;
};

export async function replaceDshBundle(
  deps: ReplaceBundleDeps,
  spec: string,
  options?: BundleInstallOptions,
): Promise<BundleInstallOutcome> {
  const first = await installOnce(deps, spec, options);
  if (first.errorCode !== 'already-installed') return settle(deps, spec, options, first);
  const pkg = bundleNameOf(first, spec);
  const removed = await deps.remove(pkg);
  if (removed.application !== 'applied') {
    return {
      change: removed,
      module: deps.installed?.(pkg) ?? { kind: 'unknown', pkg },
      supply: { state: 'no-needs' },
    };
  }
  return settle(deps, spec, options, await installOnce(deps, spec, options));
}

function installOptions(options: BundleInstallOptions | undefined) {
  return {
    ...(options?.registry === undefined ? {} : { registry: options.registry }),
    ...(options?.requestId === undefined ? {} : { requestId: options.requestId }),
    ...(options?.approvedBuilds === undefined ? {} : { approvedBuilds: options.approvedBuilds }),
  };
}

async function installOnce(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options: BundleInstallOptions | undefined,
): Promise<BundleChange> {
  const change = await deps.manager.install({ spec, ...installOptions(options) });
  if (change === null) throw new Error('插件管理器回的安装结果看不懂。');
  return change;
}

async function settle(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options: BundleInstallOptions | undefined,
  change: BundleChange,
): Promise<BundleInstallOutcome> {
  const pkg = bundleNameOf(change, spec);
  const module = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const registry =
    options?.registry ?? (module.kind === 'module' ? module.registry : undefined);
  await deps.rememberSource(
    deps.manager,
    pkg,
    registry,
    module.kind === 'module' ? module.version : undefined,
  );
  return { change, module, supply: await deps.supplyAfter(module, change) };
}

export async function installRouted(deps: BundleInstallDeps): Promise<BundleInstallOutcome> {
  const { spec, options, registry, shell } = deps;
  const supply = deps.supply ?? requireSupply();
  const route = await supply.packageRouteOf({
    spec,
    ...(shell === undefined ? {} : { shell }),
    ...(registry === undefined ? {} : { registry }),
  });
  if (route === undefined || route.kind === 'dsh-bundle') return installDshBundle(deps, spec, options);

  const pkg = route.pkg ?? splitNpmSpec(spec)?.name ?? spec.trim();
  if (route.kind === 'neither') {
    deps.logger?.warn?.(`[dsh-workbench] 不装 ${pkg}：${refusalReason()}`);
    return outcomeOf(deps, pkg, {
      application: 'failed',
      stage: 'install',
      changed: false,
      target: pkg,
      errorCode: 'not-a-module-or-plugin',
      errorDetail: refusalReason(),
    });
  }

  const plan = supply.pluginInstallPlan({
    spec,
    command: deps.command,
    ...(registry === undefined ? {} : { registry }),
    ...(route.pluginName === undefined ? {} : { pluginName: route.pluginName }),
  });
  if (!plan.ok) throw new Error(sourceProblemText(plan.problem, plan.env));
  deps.ledger?.intend({
    package: pkg,
    ...(registry === undefined ? {} : { registry }),
    ...(localDirOf(spec) === undefined ? {} : { local: true }),
  });
  try {
    await deps.runAll(plan.commands);
  } catch (error) {
    deps.ledger?.drop(pkg);
    throw error;
  }
  deps.ledger?.complete(pkg, installedPluginName(spec, pkg));
  deps.logger?.info?.(`[dsh-workbench] 把 ${pkg} 装进了运行时的插件区`);
  return outcomeOf(
    deps,
    pkg,
    { application: 'applied', stage: 'install', changed: true, target: pkg },
    { kind: 'runtime-plugin', pkg, ...(route.pluginName === undefined ? {} : { name: route.pluginName }) },
  );
}
