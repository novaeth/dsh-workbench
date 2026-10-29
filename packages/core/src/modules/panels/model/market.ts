import { basename } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import type { Need, UnitManifest } from '@dsh-workbench/shared';
import { INSTALL_TIMEOUT_MS, needsOf as needsOfManifest } from '@dsh-workbench/shared/host';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule, LibNeed, ProfileModule, ProfilePackage } from '@dsh-workbench/shared/host';
import type { RegistryNotebook } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import { requireSupply, type SupplyPort, type UnitMountDeps } from '@dsh-workbench/shared/host';
import { runShell } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { diagnoseInstallFailure, installWriteProblem } from '@dsh-workbench/shared/host';
import { installError } from './market-install-error';
import {
  affectedUnitsOf,
  findDependency,
  sourceProblemText,
  sharedDependencies,
  type DependencyTarget,
  type SharedDependency,
} from './market-dependency';
import { installRouted, replaceDshBundle, type ReplaceBundleDeps } from './market-route';
import { updateModuleBundle } from './market-update-bundle';
import { removeDshBundle } from './market-remove';
import { supplyUpdateStillBehind } from './market-verify';
import { updateDependencyRow as runDependencyUpdate } from './market-dependency-update';
import type { SelfUpdateRequest, SelfUpdateStart } from '@dsh-workbench/shared/host';
import { updateWorkbenchOnce } from './market-workbench-update';
import { createWorkbenchFollowUps, type WorkbenchFollowUpDeps } from './market-follow-up';
import { createEnvDropper } from './market-env';
import {
  rememberInstalledSource,
  type RegistryFixDeps,
} from './market-registry';
import { createPluginActions, type PluginReferences } from './plugin-actions';
import { restartLogLine } from './market-restart';
import type { PluginLedger } from './plugin-ledger';
import type {
  BundleInstallOptions,
  BundleInstallOutcome,
  BundleSupply,
  MarketAction,
  MarketEntry,
  MarketService,
} from './market-types';
export type { SharedDependency } from './market-dependency';
export type {
  BundleInstallOptions,
  BundleInstallOutcome,
  BundleRemoveOutcome,
  BundleSupply,
  MarketAction,
  MarketEntry,
  MarketService,
  UninstallResult,
} from './market-types';
export function createMarketService(options: {
  manifests: readonly UnitManifest[];
  manifestsNow?: (() => readonly UnitManifest[]) | undefined;
  probe?: UnitMountDeps['probe'];
  shell?: DshShell | undefined;
  command: string;
  onInstalled?: (unit: string) => void;
  onUninstalled?: (unit: string) => void;
  isReleased?: (unit: string) => boolean;
  bundles?: BundleManager | undefined;
  installed?: ((pkg: string) => InstalledModule) | undefined;
  modules?: (() => readonly ProfileModule[]) | undefined;
  workbench?: ((pkg: string) => ProfilePackage | undefined) | undefined;
  registries?: RegistryNotebook | undefined;
  profileDir?: string | null | undefined;
  ledger?: PluginLedger | undefined;
  references?: (() => PluginReferences) | undefined;
  dshHome?: (() => string) | undefined;
  profileName?: (() => string | null) | undefined;
  selfUpdate?: ((request: SelfUpdateRequest, onError: (message: string) => void) => SelfUpdateStart) | undefined;
  runMigration?: WorkbenchFollowUpDeps['runMigration'];
  logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  supply?: SupplyPort | undefined;
}): MarketService {
  const {
    manifests,
    manifestsNow,
    probe,
    shell,
    logger,
    supply: supplyOption,
    onInstalled,
    onUninstalled,
    isReleased,
    bundles,
    installed,
    modules,
    workbench,
    registries,
    profileDir,
    ledger,
    references,
    dshHome,
    profileName,
  } = options;
  const supply = supplyOption ?? requireSupply();
  const command = options.command;
  const catalog = (): readonly UnitManifest[] => manifestsNow?.() ?? manifests;

  function requireEntry(unit: string): UnitManifest {
    const manifest = catalog().find((item) => item.id === unit);
    if (manifest === undefined) {
      throw new Error(`市场里没有这个模块：${unit}（可安装：${catalog().map((item) => item.id).join(', ') || '（空）'}）`);
    }
    return manifest;
  }

  async function capabilityOf(unit: string, force = false): Promise<UnitCapability> {
    const probed = await probe?.(unit, { force });
    return (
      probed ?? {
        unit,
        status: 'unchecked',
        needs: [],
        detail: '没有探测能力（缺少执行缝或探测服务）',
      }
    );
  }

  function sourceEnvOf(need: Need | undefined): string | undefined {
    if (need === undefined) return undefined;
    const sources = 'sources' in need ? need.sources : undefined;
    for (const source of sources ?? []) {
      if (source.kind === 'local') return source.env;
      if (source.kind === 'npm') return source.registryEnv;
    }
    return undefined;
  }

  function needsOf(unit: string): readonly Need[] {
    return needsOfManifest(requireEntry(unit));
  }

  async function entryOf(unit: string, force = false): Promise<MarketEntry> {
    const manifest = requireEntry(unit);
    return {
      unit,
      titleKey: manifest.titleKey,
      needs: needsOfManifest(manifest),
      capability: await capabilityOf(unit, force),
    };
  }

  async function run(line: string, optional = false): Promise<void> {
    if (shell === undefined) {
      throw new Error('没有执行缝（shell 服务不可用），装 / 卸做不了。');
    }
    const blocked = installWriteProblem({ command: line, fallback: supply.modules.isolatedRoot() });
    if (blocked !== undefined) throw installError(blocked);
    const result = await runShell(shell, line, { timeoutMs: INSTALL_TIMEOUT_MS });
    if (result.exitCode !== 0 && !optional) {
      throw installError(
        diagnoseInstallFailure({
          command: line,
          exitCode: result.exitCode,
          output: result.stderr || result.stdout,
          fallback: supply.modules.isolatedRoot(),
        }),
      );
    }
  }

  async function runAll(commands: readonly { readonly line: string; readonly optional?: true }[]): Promise<void> {
    for (const step of commands) await run(step.line, step.optional === true);
  }

  async function probeSharing(request: {
    readonly action: MarketAction;
    readonly unit?: string;
    readonly id?: string;
  }): Promise<void> {
    for (const id of affectedUnitsOf(catalog(), request)) {
      if (id !== request.unit) await capabilityOf(id, true);
    }
  }

  async function snapshot(force = false): Promise<{ modules: MarketEntry[]; shared: SharedDependency[] }> {
    const modules = await Promise.all(catalog().map((manifest) => entryOf(manifest.id, force)));
    const capabilities = new Map(modules.map((entry) => [entry.unit, entry.capability]));
    return {
      modules,
      shared: sharedDependencies({
        manifests: catalog(),
        capabilities,
        ...(isReleased === undefined ? {} : { isReleased }),
      }),
    };
  }

  function requireDependency(id: string): DependencyTarget {
    const target = findDependency(catalog(), id, isReleased, supply.pluginPackagePrefix?.());
    if (target === undefined) {
      const known = sharedDependencies({ manifests: catalog(), capabilities: new Map() }).map((item) => item.id);
      throw new Error(`市场里没有这份依赖：${id}（可用的：${known.join(', ') || '（空）'}）`);
    }
    return target;
  }

  async function updateDependencyRow(id: string): Promise<readonly SharedDependency[]> {
    const target = requireDependency(id);
    return runDependencyUpdate(target, {
      capabilityOf,
      runAll,
      snapshot: async () => (await snapshot()).shared,
      ...(logger === undefined ? {} : { logger }),
    });
  }

  function requireBundles(): BundleManager {
    if (bundles === undefined) throw new Error('这个 profile 里没有插件管理器，装不了模块包。');
    return bundles;
  }

  const envDropper = createEnvDropper({
    catalog,
    ...(isReleased === undefined ? {} : { isReleased }),
    ...(ledger === undefined ? {} : { ledger }),
    ...(references === undefined ? {} : { references }),
    command,
    run,
    libUninstallCommand: (need) => supply.libUninstallCommand({ need: need as LibNeed }),
    ...(logger === undefined ? {} : { logger }),
  });

  function pluginUsersOf(plugin: string, except?: string): string[] {
    return envDropper.usersOf(plugin, except);
  }

  async function reprobePlugin(pkg: string, name: string | undefined): Promise<void> {
    const keys = name === undefined || name === pkg ? [pkg] : [name, pkg];
    for (const key of keys) {
      const id = `plugin:${key}`;
      if (findDependency(catalog(), id, isReleased) === undefined) continue;
      await probeSharing({ action: 'update-dependency', id });
    }
  }

  async function supplyAfter(module: InstalledModule, change: BundleChange): Promise<BundleSupply> {
    if (module.kind !== 'module') return { state: 'not-a-module' };
    const manifest = catalog().find((item) => item.id === module.unit);
    if (manifest === undefined) {
      return change.application === 'restart-required' ? { state: 'pending-restart' } : { state: 'no-needs' };
    }
    const needs = needsOfManifest(manifest).filter(
      (need) => need.kind === 'extension' || need.kind === 'lib',
    ).length;
    if (needs === 0) return { state: 'no-needs' };
    try {
      return { state: 'installed', entry: await service.install(module.unit) };
    } catch (error) {
      return { state: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  const registryFix: RegistryFixDeps = {
    ...(registries === undefined ? {} : { registries }),
    ...(profileDir === undefined || profileDir === null ? {} : { profileDir }),
    ...(logger === undefined ? {} : { logger }),
  };

  function routeDeps(manager: BundleManager): ReplaceBundleDeps {
    return {
      manager,
      command,
      supply,
      runAll,
      rememberSource: (manager, pkg, registry, version) =>
        rememberInstalledSource(registryFix, manager, pkg, registry, version),
      supplyAfter,
      remove: (pkg) =>
        removeDshBundle({ manager, pkg, profileDir, registryFix, ...(logger === undefined ? {} : { logger }) }),
      ...(shell === undefined ? {} : { shell }),
      ...(installed === undefined ? {} : { installed }),
      ...(ledger === undefined ? {} : { ledger }),
      ...(logger === undefined ? {} : { logger }),
    };
  }

  const plugins = createPluginActions({
    ...(ledger === undefined ? {} : { ledger }),
    ...(shell === undefined ? {} : { shell }),
    command,
    runAll,
    claimedBy: (plugin) => pluginUsersOf(plugin),
    ...(references === undefined ? {} : { references }),
    ...(logger === undefined ? {} : { logger }),
    supply,
  });

  async function installByRoute(spec: string, options?: BundleInstallOptions): Promise<BundleInstallOutcome> {
    const manager = requireBundles();
    const registry = options?.registry ?? (await manager.registries().catch(() => null))?.resolved ?? undefined;
    const outcome = await installRouted({
      ...routeDeps(manager),
      spec,
      ...(options === undefined ? {} : { options }),
      ...(registry === undefined ? {} : { registry }),
    });
    const restart = restartLogLine(outcome?.change);
    if (restart !== undefined) logger?.info?.(restart);
    return outcome;
  }

  const service: MarketService = {
    async list() {
      return snapshot();
    },

    async install(unit) {
      const before = await capabilityOf(unit, true);
      const absent = before.needs.filter(
        (state) =>
          state.status === 'missing' &&
          (state.kind === 'extension' || state.kind === 'lib' || state.kind === 'bin'),
      );
      if (absent.length === 0) {
        onInstalled?.(unit);
        return entryOf(unit, true);
      }
      for (const state of absent) {
        if (state.provision !== undefined && state.provision !== 'ready') {
          const need = needsOf(unit).find((item) => item.name === state.name);
          throw new Error(sourceProblemText(state.provision, sourceEnvOf(need)));
        }
        if (state.command === undefined) {
          throw new Error(`没有可执行的安装命令（${state.detail}）`);
        }
        await run(state.command);
        supply.afterLibInstall();
      }
      await probeSharing({ action: 'install', unit });
      onInstalled?.(unit);
      return entryOf(unit, true);
    },

    async update(unit) {
      const before = await capabilityOf(unit, true);
      const stale = before.needs.filter(
        (state) =>
          (state.kind === 'extension' || state.kind === 'lib') &&
          (state.status === 'outdated' || state.status === 'unsatisfied'),
      );
      for (const state of stale) {
        await run(
          state.command ?? `${quoteShellArg(command)} plugin update ${quoteShellArg(state.name)}`,
        );
        logger?.info?.(`[dsh-workbench] 已更新 ${state.name}`);
      }
      if (stale.length === 0 && before.status === 'outdated') {
        throw new Error(`没有可执行的更新命令（这一格还是旧的样子：${before.detail ?? ''}）`);
      }
      await probeSharing({ action: 'update', unit });
      const entry = await entryOf(unit, true);
      const behind = supplyUpdateStillBehind(entry.capability);
      if (behind !== undefined) throw new Error(behind);
      return entry;
    },

    async uninstall(unit) {
      const pkg = (modules?.() ?? []).find((item) => item.unit === unit)?.pkg;
      if (pkg !== undefined) {
        const entry = await entryOf(unit, true);
        const { change, keptFor } = await service.removeBundle(pkg);
        const released = change.application === 'applied';
        return {
          entry: released ? { ...entry, capability: { ...entry.capability, released: true } } : entry,
          keptFor,
          change,
        };
      }
      const before = await capabilityOf(unit, true);
      const keptFor = await envDropper.drop(unit, needsOf(unit), before);
      await plugins.sweep();
      await probeSharing({ action: 'uninstall', unit });
      const entry = await entryOf(unit, true);
      onUninstalled?.(unit);
      return {
        entry: { ...entry, capability: { ...entry.capability, released: true } },
        keptFor,
      };
    },

    async installBundle(spec, options) {
      return installByRoute(spec, options);
    },

    async replaceBundle(spec, options) {
      const manager = requireBundles();
      const registry = options?.registry ?? (await manager.registries().catch(() => null))?.resolved ?? undefined;
      const outcome = await replaceDshBundle(routeDeps(manager), spec, {
        ...(options === undefined ? {} : options),
        ...(registry === undefined ? {} : { registry }),
      });
      const restart = restartLogLine(outcome.change);
      if (restart !== undefined) logger?.info?.(restart);
      return outcome;
    },

    async removeBundle(pkg) {
      const manager = requireBundles();
      const module = installed?.(pkg) ?? { kind: 'unknown', pkg };
      const unit = module.kind === 'module' ? module.unit : undefined;
      const roster = catalog();
      const manifest = unit === undefined ? undefined : roster.find((item) => item.id === unit);
      const before = unit === undefined ? undefined : await capabilityOf(unit, true);
      const change = await removeDshBundle({
        manager,
        pkg,
        profileDir,
        registryFix,
        ...(logger === undefined ? {} : { logger }),
      });
      if (change.application !== 'applied' || unit === undefined) return { change, keptFor: [] };
      const keptFor =
        manifest === undefined || before === undefined
          ? []
          : await envDropper.drop(unit, needsOfManifest(manifest), before, roster);
      await plugins.sweep((plugin) => envDropper.usersOf(plugin, unit, roster));
      onUninstalled?.(unit);
      return { change, keptFor };
    },

    async cancelInstall(requestId) {
      return requireBundles().cancel(requestId);
    },

    async updateBundle(unit) {
      const manager = requireBundles();
      const home = dshHome?.();
      const profile = profileName?.() ?? (profileDir === undefined || profileDir === null ? undefined : basename(profileDir));
      return updateModuleBundle(unit, {
        supply,
        modules,
        installed,
        shell,
        manager,
        ...(profile === undefined ? {} : { profile, profileName: profile }),
        ...(home === undefined ? {} : { dshHome: home }),
        routeDeps: routeDeps(manager),
        sweep: async () => {
          await plugins.sweep((plugin) => envDropper.usersOf(plugin, undefined, catalog()));
        },
        refreshSupply: async (id) => {
          await service.update(id);
        },
        ...(logger === undefined ? {} : { logger }),
      });
    },

    async updateWorkbench(pkg) {
      return updateWorkbenchOnce({
        supply,
        asked: pkg,
        ...(workbench === undefined ? {} : { workbench }),
        ...(shell === undefined ? {} : { shell }),
        ...(installed === undefined ? {} : { installed }),
        ...(dshHome === undefined ? {} : { dshHome }),
        ...(profileName === undefined ? {} : { profileName }),
        profileRegistry: async () => {
          try {
            return (await requireBundles().registries())?.resolved ?? undefined;
          } catch {
            return undefined;
          }
        },
        ...(options.selfUpdate === undefined ? {} : { selfUpdate: options.selfUpdate }),
        ...(logger === undefined ? {} : { logger }),
      });
    },

    async updatePlugin(pkg) {
      const outcome = await plugins.update(pkg);
      await reprobePlugin(pkg, outcome.name);
      return outcome;
    },

    async uninstallPlugin(pkg) {
      const outcome = await plugins.uninstall(pkg);
      await reprobePlugin(pkg, outcome.name);
      return outcome;
    },

    ...createWorkbenchFollowUps({
      dshHome,
      profileName,
      workbench,
      ...(options.runMigration === undefined ? {} : { runMigration: options.runMigration }),
    }),
    updateDependency: updateDependencyRow,
  };
  return service;
}
