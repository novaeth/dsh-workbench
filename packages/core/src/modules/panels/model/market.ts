import type { DshShell } from '@dsh-workbench/shared';
import type { UnitLibNeed, UnitManifest, UnitPluginNeed } from '@dsh-workbench/shared';
import { INSTALL_TIMEOUT_MS } from '@dsh-workbench/shared/host';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule, ProfilePackage } from '@dsh-workbench/shared/host';
import type { RegistryNotebook } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import { requireSupply, type SupplyPort, type UnitMountDeps } from '@dsh-workbench/shared/host';
import { runShell } from '@dsh-workbench/shared/host';
import { quoteShellArg, tailLines } from '@dsh-workbench/shared/host';
import {
  affectedUnitsOf,
  findDependency,
  sharedDependencies,
  sourceProblemText,
  type DependencyTarget,
  type SharedDependency,
} from './market-dependency';
import { installRouted, type ReplaceBundleDeps } from './market-route';
import { updateModuleBundle } from './market-update-bundle';
import { supplyUpdateStillBehind } from './market-verify';
import { updateDependencyRow as runDependencyUpdate } from './market-dependency-update';
import type { SelfUpdateRequest, SelfUpdateStart } from '@dsh-workbench/shared/host';
import { updateWorkbenchOnce } from './market-workbench-update';
import { createEnvDropper } from './market-env';
import {
  rememberInstalledSource,
  retryAfterRegistryFix,
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
  command?: string | undefined;
  onInstalled?: (unit: string) => void;
  onUninstalled?: (unit: string) => void;
  isReleased?: (unit: string) => boolean;
  bundles?: BundleManager | undefined;
  installed?: ((pkg: string) => InstalledModule) | undefined;
  modules?: (() => readonly ProfileModule[]) | undefined;
  workbench?: ((pkg: string) => ProfilePackage | undefined) | undefined;
  registries?: RegistryNotebook | undefined;
  ledger?: PluginLedger | undefined;
  references?: (() => PluginReferences) | undefined;
  dshHome?: (() => string) | undefined;
  profileName?: (() => string | null) | undefined;
  selfUpdate?: ((request: SelfUpdateRequest, onError: (message: string) => void) => SelfUpdateStart) | undefined;
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
    ledger,
    references,
    dshHome,
    profileName,
  } = options;
  const supply = supplyOption ?? requireSupply();
  const command = options.command ?? 'opencli';
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
        required: [],
        missing: [],
        detail: '没有探测能力（缺少执行缝或探测服务）',
      }
    );
  }

  function needsOf(unit: string): readonly UnitPluginNeed[] {
    return requireEntry(unit).env?.plugins ?? [];
  }

  function libsOf(unit: string): readonly UnitLibNeed[] {
    return requireEntry(unit).env?.libs ?? [];
  }

  function libCommand(need: UnitLibNeed, version?: string): string {
    return supply.libInstallCommand({
      need,
      ...(version === undefined ? {} : { version }),
    });
  }

  async function entryOf(unit: string, force = false): Promise<MarketEntry> {
    const manifest = requireEntry(unit);
    return {
      unit,
      titleKey: manifest.card?.titleKey ?? unit,
      plugins: (manifest.env?.plugins ?? []).map((need) => ({
        name: need.name,
        ...(need.installSource === undefined ? {} : { source: need.installSource }),
      })),
      libs: (manifest.env?.libs ?? []).map((need) => ({
        name: need.name,
        ...(need.version === undefined ? {} : { version: need.version }),
        purpose: need.purpose,
      })),
      capability: await capabilityOf(unit, force),
    };
  }

  async function run(line: string, optional = false): Promise<void> {
    if (shell === undefined) {
      throw new Error('没有执行缝（shell 服务不可用），装 / 卸做不了。');
    }
    const result = await runShell(shell, line, { timeoutMs: INSTALL_TIMEOUT_MS });
    if (result.exitCode !== 0 && !optional) {
      const tail = tailLines(result.stderr || result.stdout, 6);
      throw new Error(`命令失败（退出码 ${result.exitCode}）${tail === '' ? '' : `：${tail}`}`);
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
    const target = findDependency(catalog(), id, isReleased);
    if (target === undefined) {
      const known = sharedDependencies({ manifests: catalog(), capabilities: new Map() }).map((item) => item.id);
      throw new Error(`市场里没有这份依赖：${id}（可用的：${known.join(', ') || '（空）'}）`);
    }
    return target;
  }

  async function updateDependencyRow(id: string): Promise<readonly SharedDependency[]> {
    const target = requireDependency(id);
    return runDependencyUpdate(target, {
      command,
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
    const needs = (manifest.env?.plugins ?? []).length + (manifest.env?.libs ?? []).length;
    if (needs === 0) return { state: 'no-needs' };
    try {
      return { state: 'installed', entry: await service.install(module.unit) };
    } catch (error) {
      return { state: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  const registryFix: RegistryFixDeps = {
    ...(registries === undefined ? {} : { registries }),
    ...(logger === undefined ? {} : { logger }),
  };

  async function removeInstalledBundle(manager: BundleManager, pkg: string): Promise<BundleChange> {
    const first = await manager.remove(pkg);
    if (first === null) throw new Error('插件管理器回的卸载结果看不懂。');
    const settled = await retryAfterRegistryFix(registryFix, manager, pkg, first);
    if (settled.application !== 'failed' && settled.application !== 'cancelled') return settled;
    const put = await manager.setEnabled?.(pkg, true);
    logger?.warn?.(
      `[dsh-workbench] ${pkg} 没卸成（${settled.errorCode ?? settled.application}）—— 已把它那一行放回名单，别让一次失败留在"装着但关着"`,
    );
    return put ?? settled;
  }

  function routeDeps(manager: BundleManager): ReplaceBundleDeps {
    return {
      manager,
      command,
      supply,
      runAll,
      rememberSource: (manager, pkg, registry) => rememberInstalledSource(registryFix, manager, pkg, registry),
      supplyAfter,
      remove: (pkg) => removeInstalledBundle(manager, pkg),
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
      const needs = needsOf(unit);

      const before = await capabilityOf(unit, true);
      const absent = (before.plugins ?? []).filter((state) => state.status === 'missing');
      const absentLibs = (before.libs ?? []).filter(
        (state) => state.status === 'missing' || state.status === 'unsatisfied',
      );
      if (absent.length === 0 && absentLibs.length === 0) {
        onInstalled?.(unit);
        return entryOf(unit, true);
      }
      for (const state of absentLibs) {
        const need = libsOf(unit).find((item) => item.name === state.name);
        if (need !== undefined) await run(libCommand(need));
      }

      const resolved = absent.map((state) => {
        const need = needs.find((item) => item.name === state.name);
        return {
          name: state.name,
          source: supply.resolvePluginSource(need?.installSource, process.env, { command, plugin: state.name }),
        };
      });
      const broken = resolved.find((item) => !item.source.ok);
      if (broken !== undefined && !broken.source.ok) {
        throw new Error(sourceProblemText(broken.source.problem, broken.source.env));
      }

      for (const item of resolved) {
        if (!item.source.ok) continue;
        await runAll(item.source.commands);
      }
      await probeSharing({ action: 'install', unit });
      onInstalled?.(unit);
      return entryOf(unit, true);
    },

    async update(unit) {
      const before = await capabilityOf(unit, true);
      const outdated = (before.plugins ?? []).filter((state) => state.status === 'outdated');
      const staleLibs = (before.libs ?? []).filter((item) => item.status === 'outdated');
      for (const state of staleLibs) {
        const need = libsOf(unit).find((item) => item.name === state.name);
        if (need !== undefined) await run(libCommand(need, state.latest));
      }

      const needs = needsOf(unit);
      for (const state of outdated) {
        const release = state.release;
        const need = needs.find((item) => item.name === state.name);
        const latest = release?.latest;
        const upgrade =
          need === undefined || release === undefined || latest === undefined || !supply.isNewerVersion(latest, release.installed)
            ? undefined
            : supply.resolvePluginSource(need.installSource, process.env, {
                command,
                plugin: state.name,
                version: latest,
                mode: 'update',
              });
        if (upgrade?.ok === true) {
          await runAll(upgrade.commands);
        } else {
          await run(`${quoteShellArg(command)} plugin update ${quoteShellArg(state.name)}`);
        }
        logger?.info?.(`[dsh-workbench] 已更新 ${state.name}`);
      }
      if (outdated.length === 0 && staleLibs.length === 0 && before.fix === 'update') {
        throw new Error(`没有可执行的更新命令（这一格还是旧的样子：${before.detail}）`);
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
      const keptFor = await envDropper.drop(unit, requireEntry(unit).env, before);
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

    async removeBundle(pkg) {
      const manager = requireBundles();
      const module = installed?.(pkg) ?? { kind: 'unknown', pkg };
      const unit = module.kind === 'module' ? module.unit : undefined;
      const manifest = unit === undefined ? undefined : catalog().find((item) => item.id === unit);
      const before = unit === undefined ? undefined : await capabilityOf(unit, true);
      const change = await removeInstalledBundle(manager, pkg);
      if (change.application !== 'applied' || unit === undefined) return { change, keptFor: [] };
      const keptFor =
        manifest === undefined || before === undefined ? [] : await envDropper.drop(unit, manifest.env, before);
      await plugins.sweep();
      onUninstalled?.(unit);
      return { change, keptFor };
    },

    async cancelInstall(requestId) {
      return requireBundles().cancel(requestId);
    },

    async updateBundle(unit) {
      const manager = requireBundles();
      return updateModuleBundle(unit, {
        supply,
        modules,
        installed,
        shell,
        manager,
        routeDeps: routeDeps(manager),
        sweep: async () => {
          await plugins.sweep();
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

    updateDependency: updateDependencyRow,
  };
  return service;
}
