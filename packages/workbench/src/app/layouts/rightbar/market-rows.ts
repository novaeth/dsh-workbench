import type { ModuleVersion } from '@/shared/api/bundle-install';
import type { PluginSource, Translate, UnitManifest } from '@dsh-workbench/shared';
import { hasEnvSupply } from '@dsh-workbench/shared';
import type {
  MarketNote,
  MarketRow,
  MarketRowAction,
  MarketState,
  ModuleUpdate,
} from './market-row-types';
import type { SharedRow } from './market-shared-rows';

import type { CapabilityMap } from '@/shared/hooks/use-capabilities';

export type {
  MarketHintKey,
  MarketNote,
  MarketRow,
  MarketRowAction,
  MarketState,
  ModuleUpdate,
} from './market-row-types';
export type { SharedRow, SharedState } from './market-shared-rows';
export { SHARED_STATE_KEY, sharedActions, sharedRows } from './market-shared-rows';
export const MARKET_STATE_KEY: Readonly<Record<MarketState, string>> = {
  checking: 'panels.market.checking',
  installed: 'panels.market.installed',
  inactive: 'panels.market.notActive',
  unusable: 'panels.market.notUsable',
  broken: 'panels.market.broken',
  outdated: 'panels.market.moduleOutdated',
  'pending-restart': 'panels.market.pendingRestart',
  missing: 'panels.market.missing',
  unchecked: 'panels.market.unchecked',
  unknown: 'panels.market.unchecked',
};

export const MARKET_DOT: Readonly<
  Record<MarketState, 'ongoing' | 'done' | 'warning' | 'idle' | 'error'>
> = {
  checking: 'ongoing',
  installed: 'done',
  inactive: 'error',
  unusable: 'error',
  broken: 'error',
  outdated: 'warning',
  'pending-restart': 'error',
  missing: 'idle',
  unchecked: 'idle',
  unknown: 'idle',
};

export type ModuleUpdateMap = Readonly<Record<string, ModuleUpdate>>;

export function marketRowTitle(row: MarketRow, t: Translate): string {
  return row.label ?? t(row.titleKey);
}

export interface InstalledWorkbenchModule {
  readonly unit: string;
  readonly pkg: string;
  readonly installed: string;
  readonly latest?: string | undefined;
  readonly local?: boolean | undefined;
  readonly refused?: readonly string[] | undefined;
  readonly clientRefused?: readonly string[] | undefined;
}

export function withClientRefusals(
  modules: readonly InstalledWorkbenchModule[],
  refusals: readonly {
    readonly unit: string;
    readonly kind?: string | undefined;
    readonly reasons: readonly string[];
  }[],
): readonly InstalledWorkbenchModule[] {
  const refused = refusals.filter((one) => one.kind !== 'no-manifest');
  if (refused.length === 0) return modules;
  const byUnit = new Map(refused.map((one) => [one.unit, one.reasons] as const));
  return modules.map((module) => {
    const reasons = byUnit.get(module.unit);
    return reasons === undefined ? module : { ...module, clientRefused: reasons };
  });
}

export function refusalReasons(
  host: readonly string[] | undefined,
  client: readonly string[] | undefined,
): readonly string[] {
  const reported = host ?? [];
  if (reported.length > 0) return reported;
  return [...new Set(client ?? [])];
}

export function mergeTitles(
  known: ReadonlyMap<string, string>,
  manifests: readonly UnitManifest[],
): ReadonlyMap<string, string> {
  let next: Map<string, string> | null = null;
  for (const manifest of manifests) {
    const titleKey = manifest.card?.titleKey;
    if (titleKey === undefined || known.has(manifest.id)) continue;
    next ??= new Map(known);
    next.set(manifest.id, titleKey);
  }
  return next ?? known;
}

export function installedIdSet(
  installed: readonly InstalledWorkbenchModule[] | undefined,
): ReadonlySet<string> | null {
  if (installed === undefined) return null;
  return new Set(installed.map((item) => item.unit));
}

export function installedRows(
  modules: readonly InstalledWorkbenchModule[],
  manifests: readonly UnitManifest[],
  listed: ReadonlySet<string>,
  known?: ReadonlyMap<string, string> | undefined,
  defaults: ReadonlySet<string> = new Set(),
  changed: Readonly<Record<string, number>> = {},
): MarketRow[] {
  const titles = new Map(
    manifests.map((manifest) => [manifest.id, manifest.card?.titleKey] as const),
  );
  const rows: MarketRow[] = [];
  for (const module of modules) {
    if (listed.has(module.unit)) continue;
    const latest = module.local === true ? undefined : module.latest;
    const outdated = latest !== undefined && latest !== module.installed;
    const loaded = titles.has(module.unit);
    const refused = refusalReasons(module.refused, module.clientRefused);
    const pending = !loaded && refused.length === 0;
    rows.push({
      id: module.unit,
      titleKey: titles.get(module.unit) ?? known?.get(module.unit) ?? module.pkg,
      state: outdated ? 'outdated' : refused.length > 0 ? 'unusable' : pending ? 'inactive' : 'installed',
      ...(pending ? { hint: 'panels.market.moduleRestartHint' } : {}),
      ...(refused.length === 0
        ? {}
        : {
            note: {
              key: 'panels.market.moduleRefused' as const,
              params: { reason: refused.join('；') },
            },
          }),
      ...(module.local === true ? { local: true } : {}),
      pkg: module.pkg,
      canInstall: false,
      canUpdate: outdated,
      canUninstall: true,
      version: { installed: module.installed, ...(latest === undefined ? {} : { latest }) },
      ...(outdated ? { moduleUpdate: { installed: module.installed, latest: latest } } : {}),
      defaultShown: defaults.has(module.unit),
      defaultChanged: changed[module.unit] ?? 0,
    });
  }
  return rows;
}

const SWITCH_LOCKED: ReadonlySet<MarketState> = new Set(['unusable', 'broken']);

export function marketSwitchLocked(row: MarketRow): boolean {
  return SWITCH_LOCKED.has(row.state);
}

export function marketActions(row: MarketRow): MarketRowAction[] {
  if (row.workbench === true) {
    return row.canUpdate ? ['update-workbench'] : [];
  }
  if (row.plugin === true) {
    return [
      ...(row.canUpdate ? (['update-plugin'] as const) : []),
      ...(row.canUninstall ? (['uninstall-plugin'] as const) : []),
    ];
  }
  return [
    ...(row.canInstall ? (['install'] as const) : []),
    ...(row.moduleUpdate === undefined
      ? row.canUpdate
        ? (['update'] as const)
        : []
      : (['update-bundle'] as const)),
    ...(row.canUninstall
      ? ([row.pkg === undefined ? 'uninstall' : 'remove-bundle'] as const)
      : []),
  ];
}

function stateOf(
  capability: CapabilityMap[string] | undefined,
  manifest: UnitManifest,
  installed: boolean,
): MarketState {
  if (capability === undefined) {
    return installed && !hasEnvSupply(manifest) ? 'installed' : 'unknown';
  }
  if (capability.released === true) return 'missing';
  if (capability.status === 'missing-plugin') return 'missing';
  if (capability.status === 'unchecked') return 'unchecked';
  return isOutdated(capability) ? 'outdated' : 'installed';
}

function isOutdated(capability: CapabilityMap[string] | undefined): boolean {
  if (capability === undefined) return false;
  return capability.status === 'missing-commands';
}

export function capabilityOutdated(capabilities: CapabilityMap | null, unit: string): boolean {
  return isOutdated(capabilities?.[unit]);
}

function envNameOf(source: PluginSource | undefined): string {
  if (source === undefined) return '';
  if (source.kind === 'local') return source.env;
  if (source.kind === 'npm') return source.registryEnv;
  return '';
}

function noteOf(
  state: MarketState,
  capability: CapabilityMap[string] | undefined,
  manifest: UnitManifest,
): MarketNote | undefined {
  if (state === 'installed') return undefined;
  const install = capability?.install;
  if (install === 'env-missing') {
    const stuck = (manifest.env?.plugins ?? []).find((need) => envNameOf(need.installSource) !== '');
    return { key: 'panels.market.needEnv', params: { env: envNameOf(stuck?.installSource) } };
  }
  if (install === 'not-declared') return { key: 'panels.market.noSource', params: {} };
  if (install === 'malformed') return { key: 'panels.market.badSource', params: {} };
  const missing = capability?.missing ?? [];
  if (state === 'outdated' && missing.length > 0) {
    return {
      key: 'panels.market.needCommands',
      params: { commands: missing.join('、') },
      tone: 'plain',
    };
  }
  return undefined;
}

function isOnMachine(state: MarketState): boolean {
  return (
    state === 'installed' ||
    state === 'outdated' ||
    state === 'pending-restart' ||
    state === 'inactive' ||
    state === 'unusable' ||
    state === 'broken'
  );
}

export function marketCatalog(
  manifests: readonly UnitManifest[],
  installable: ReadonlySet<string> | null | undefined,
): readonly UnitManifest[] {
  if (installable === undefined || installable === null) return manifests.filter(hasEnvSupply);
  return manifests.filter((manifest) => installable.has(manifest.id));
}

export function liveManifests(
  manifests: readonly UnitManifest[],
  capabilities: CapabilityMap | null,
  installed: ReadonlySet<string> | null,
): readonly UnitManifest[] {
  if (capabilities === null || installed === null) return manifests;
  const gone = new Set(
    marketRows(manifests, capabilities)
      .filter(
        (row) =>
          !installed.has(row.id) &&
          marketActions(row).length === 0 &&
          (row.state === 'unknown' || row.state === 'unchecked'),
      )
      .map((row) => row.id),
  );
  if (gone.size === 0) return manifests;
  return manifests.filter((manifest) => !gone.has(manifest.id));
}

export function marketHasUpdates(rows: readonly MarketRow[], shared: readonly SharedRow[] = []): boolean {
  return (
    rows.some((row) => row.state === 'outdated' || row.moduleUpdate !== undefined) ||
    shared.some((row) => row.state === 'outdated' || row.state === 'unsatisfied')
  );
}

export function marketUpdatesOf(
  modules: readonly ModuleVersion[] | null,
): ModuleUpdateMap {
  if (modules === null) return {};
  const next: Record<string, ModuleUpdate> = {};
  for (const module of modules) {
    const local = module.local === true;
    next[module.unit] = {
      installed: module.installed,
      ...(local || module.latest === undefined ? {} : { latest: module.latest }),
      ...(local ? { local: true } : {}),
    };
  }
  return next;
}

export interface MarketSection {
  readonly id: 'installed' | 'not-installed';
  readonly titleKey: string;
  readonly rows: readonly MarketRow[];
}

export function marketOrder(
  rows: readonly MarketRow[],
  titleOf: (row: MarketRow) => string,
): MarketRow[] {
  return [...rows].sort((left, right) => {
    const byTitle = titleOf(left).localeCompare(titleOf(right), 'zh-Hans-CN');
    return byTitle === 0 ? left.id.localeCompare(right.id) : byTitle;
  });
}

export function marketSections(rows: readonly MarketRow[]): MarketSection[] {
  const installed = rows.filter((row) => isOnMachine(row.state));
  const rest = rows.filter((row) => !isOnMachine(row.state));
  return [
    ...(installed.length === 0
      ? []
      : [{ id: 'installed' as const, titleKey: 'panels.market.sectionInstalled', rows: installed }]),
    ...(rest.length === 0
      ? []
      : [{ id: 'not-installed' as const, titleKey: 'panels.market.sectionPending', rows: rest }]),
  ];
}

export function marketRows(
  manifests: readonly UnitManifest[],
  capabilities: CapabilityMap | null,
  updates: ModuleUpdateMap = {},
  defaults: ReadonlySet<string> = new Set(),
  changed: Readonly<Record<string, number>> = {},
): MarketRow[] {
  const rows: MarketRow[] = [];
  for (const manifest of manifests) {
    const capability = capabilities?.[manifest.id];
    const install = capability?.install;
    const entry = updates[manifest.id];
    const local = entry?.local === true;
    const state: MarketState =
      capabilities === null ? 'checking' : stateOf(capability, manifest, entry !== undefined);
    const note = noteOf(state, capability, manifest);
    const onMachine = isOnMachine(state);
    const reAdopt = capability?.released === true && install === undefined;

    const moduleUpdate =
      entry === undefined || entry.latest === undefined || entry.latest === entry.installed
        ? undefined
        : { installed: entry.installed, latest: entry.latest };
    rows.push({
      id: manifest.id,
      titleKey: manifest.card?.titleKey ?? manifest.id,
      state: moduleUpdate === undefined ? state : 'outdated',
      canInstall: state !== 'installed' && (install === 'ready' || reAdopt),
      canUpdate: onMachine && isOutdated(capability),
      canUninstall: onMachine,
      ...(entry === undefined
        ? {}
        : { version: { installed: entry.installed, ...(entry.latest === undefined ? {} : { latest: entry.latest }) } }),
      ...(moduleUpdate === undefined ? {} : { moduleUpdate }),
      ...(moduleUpdate === undefined ? (note === undefined ? {} : { note }) : {}),
      ...(local ? { local: true } : {}),
      defaultShown: defaults.has(manifest.id),
      defaultChanged: changed[manifest.id] ?? 0,
    });
  }
  return rows;
}
