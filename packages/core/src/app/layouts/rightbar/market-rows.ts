import type { LatestUnavailable, ModuleUpdateBlock, ModuleVersion } from '@/kernel/contract/bundle-install';
import type { MarketInstalledModule } from '@/kernel/contract/market-index';
import type { NeedState, SupplySource, Translate, UnitManifest, UnitTitle } from '@dsh-workbench/shared';
import { supplyNeedsOf } from '@dsh-workbench/shared';
import type { MarketNameMap } from './market-names';
import type {
  MarketHintKey,
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
  'pending-followup': 'panels.market.pendingFollowUp',
  missing: 'panels.market.missing',
  unchecked: 'panels.market.unchecked',
  unknown: 'panels.market.unchecked',
};

export const MARKET_DOT: Readonly<
  Record<MarketState, 'ongoing' | 'done' | 'warning' | 'idle' | 'error'>
> = {
  checking: 'ongoing',
  installed: 'done',
  inactive: 'warning',
  unusable: 'error',
  broken: 'error',
  outdated: 'warning',
  'pending-restart': 'warning',
  'pending-followup': 'warning',
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
  readonly title?: UnitTitle | undefined;
  readonly latest?: string | undefined;
  readonly latestBlocked?: ModuleUpdateBlock | undefined;
  readonly latestUnavailable?: LatestUnavailable | undefined;
  readonly local?: boolean | undefined;
  readonly refused?: readonly string[] | undefined;
  readonly clientRefused?: readonly string[] | undefined;
  readonly market?: MarketInstalledModule | undefined;
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

function updateBlockHintOf(block: ModuleUpdateBlock): MarketHintKey {
  return block === 'needs-workbench'
    ? 'panels.market.updateNeedsWorkbench'
    : 'panels.market.updateIncompatible';
}

export function installedIdSet(
  installed: readonly InstalledWorkbenchModule[] | undefined,
): ReadonlySet<string> | null {
  if (installed === undefined) return null;
  return new Set(installed.map((item) => item.unit));
}

function latestUnavailableNote(
  unavailable: InstalledWorkbenchModule['latestUnavailable'],
): MarketNote | undefined {
  if (unavailable === 'no-registry') return { key: 'panels.market.latestNoRegistry', params: {} };
  if (unavailable === 'probe-failed') return { key: 'panels.market.latestProbeFailed', params: {} };
  return undefined;
}

export interface LatestCheckSummary {
  readonly checked: number;
  readonly unknown: number;
}

export function latestCheckSummary(
  modules: readonly InstalledWorkbenchModule[] | undefined,
): LatestCheckSummary {
  let checked = 0;
  let unknown = 0;
  for (const module of modules ?? []) {
    if (module.latest !== undefined) checked += 1;
    else if (module.latestUnavailable === 'no-registry' || module.latestUnavailable === 'probe-failed') {
      unknown += 1;
    }
  }
  return { checked, unknown };
}

export function installedRows(
  modules: readonly InstalledWorkbenchModule[],
  manifests: readonly UnitManifest[],
  listed: ReadonlySet<string>,
  names?: MarketNameMap | undefined,
  defaults: ReadonlySet<string> = new Set(),
  changed: Readonly<Record<string, number>> = {},
): MarketRow[] {
  const titles = new Map(
    manifests.map((manifest) => [manifest.id, manifest.titleKey] as const),
  );
  const rows: MarketRow[] = [];
  for (const module of modules) {
    if (listed.has(module.unit)) continue;
    const latest = module.local === true ? undefined : module.latest;
    const outdated = latest !== undefined && latest !== module.installed;
    const blocked = outdated ? module.latestBlocked : undefined;
    const loaded = titles.has(module.unit);
    const refused = refusalReasons(module.refused, module.clientRefused);
    const pending = !loaded && refused.length === 0;
    const titleKey = titles.get(module.unit);
    const remembered = titleKey === undefined ? names?.get(module.unit) : undefined;
    const note =
      refused.length > 0
        ? ({ key: 'panels.market.moduleRefused', params: {} } as const)
        : latestUnavailableNote(module.latestUnavailable);
    rows.push({
      id: module.unit,
      titleKey: titleKey ?? module.unit,
      ...(remembered === undefined ? {} : { label: remembered }),
      state: outdated ? 'outdated' : refused.length > 0 ? 'unusable' : pending ? 'inactive' : 'installed',
      ...(pending
        ? { hint: 'panels.market.moduleRestartHint' as const }
        : blocked === undefined
          ? {}
          : { hint: updateBlockHintOf(blocked) }),
      ...(note === undefined ? {} : { note }),
      ...(module.local === true ? { local: true } : {}),
      pkg: module.pkg,
      canInstall: false,
      canUpdate: outdated && blocked === undefined,
      canUninstall: true,
      version: { installed: module.installed, ...(latest === undefined ? {} : { latest }) },
      ...(outdated
        ? {
            moduleUpdate: {
              installed: module.installed,
              latest,
              ...(blocked === undefined ? {} : { blocked }),
              ...(module.market === undefined ? {} : { market: module.market }),
            },
          }
        : {}),
      ...(module.market === undefined ? {} : { market: module.market }),
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

export function marketAsksAgent(row: MarketRow): boolean {
  if (row.workbench === true || row.plugin === true) return false;
  if (row.state === 'installed' || row.state === 'inactive' || row.state === 'outdated') return false;
  if (row.state === 'checking' || row.state === 'pending-restart') return false;
  if (row.state === 'pending-followup') return false;
  return !marketActions(row).includes('install');
}

export function marketActions(row: MarketRow): MarketRowAction[] {
  if (row.workbench === true) {
    if (row.followUp !== undefined && row.state === 'pending-followup') {
      return row.followUp.hard ? ['migrate-workbench'] : ['migrate-workbench', 'dismiss-followup'];
    }
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
      : row.moduleUpdate.blocked === undefined
        ? ([
            row.market === undefined || row.pkg === undefined
              ? ('update-bundle' as const)
              : ('install-version' as const),
          ])
        : []),
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
    return installed && supplyNeedsOf(manifest).length === 0 ? 'installed' : 'unknown';
  }
  if (capability.released === true) return 'missing';
  if (capability.status === 'missing') return 'missing';
  if (capability.status === 'outdated') return 'outdated';
  if (capability.status === 'unchecked') return 'unchecked';
  if (capability.status === 'failed' || capability.status === 'unsupported') return 'broken';
  return 'installed';
}

function isOutdated(capability: CapabilityMap[string] | undefined): boolean {
  if (capability?.status === 'outdated') return true;
  return capability?.needs.some((need) => need.status === 'outdated' || need.status === 'unsatisfied') === true;
}

export function capabilityOutdated(capabilities: CapabilityMap | null, unit: string): boolean {
  return isOutdated(capabilities?.[unit]);
}

function envNameOf(source: SupplySource | undefined): string {
  if (source === undefined) return '';
  if (source.kind === 'local') return source.env ?? '';
  if (source.kind === 'npm') return source.registryEnv ?? '';
  return '';
}

function noteOf(
  state: MarketState,
  capability: CapabilityMap[string] | undefined,
  manifest: UnitManifest,
): MarketNote | undefined {
  if (state === 'installed' || state === 'inactive' || state === 'pending-restart') return undefined;
  const problem: NeedState | undefined = capability?.needs.find((need) => need.status !== 'ok');
  if (problem === undefined) return undefined;
  if (problem.kind === 'env') return { key: 'panels.market.needEnv', params: { env: problem.name } };
  if (problem.kind === 'bin') return { key: 'panels.market.needBinary', params: { command: problem.name } };
  if (problem.kind === 'lib') return { key: 'panels.market.needLib', params: { name: problem.name } };
  if (problem.provision === 'env-missing') {
    const need = manifest.needs?.find((item) => item.kind === 'extension' && item.name === problem.name);
    const source = need?.kind === 'extension' ? need.sources?.find((item) => envNameOf(item) !== '') : undefined;
    return { key: 'panels.market.needEnv', params: { env: envNameOf(source) } };
  }
  if (problem.provision === 'not-declared') return { key: 'panels.market.noSource', params: {} };
  if (problem.provision === 'malformed') return { key: 'panels.market.badSource', params: {} };
  const missing = problem.missing ?? [];
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
  if (installable === undefined || installable === null) {
    return manifests.filter((manifest) => supplyNeedsOf(manifest).length > 0);
  }
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
    rows.some((row) =>
      row.moduleUpdate === undefined ? row.state === 'outdated' : row.moduleUpdate.blocked === undefined,
    ) ||
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
      ...(local || module.latest === undefined || module.latestBlocked === undefined
        ? {}
        : { blocked: module.latestBlocked }),
      ...(local ? { local: true } : {}),
      ...(local || module.market === undefined ? {} : { market: module.market }),
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

export function checkingRows(
  rows: readonly MarketRow[],
  scope: { readonly all: boolean; readonly units: ReadonlySet<string> },
): MarketRow[] {
  return rows.map((row) => {
    if (row.state !== 'unknown' && row.state !== 'unchecked') return row;
    if (!scope.all && !scope.units.has(row.id)) return row;
    return { ...row, state: 'checking', hint: undefined, note: undefined };
  });
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
    const install = capability?.needs.some((need) => need.provision === 'ready') === true;
    const installDeclared = capability?.needs.some((need) => need.provision !== undefined) === true;
    const entry = updates[manifest.id];
    const local = entry?.local === true;
    const state: MarketState =
      capabilities === null ? 'checking' : stateOf(capability, manifest, entry !== undefined);
    const note = noteOf(state, capability, manifest);
    const onMachine = isOnMachine(state);
    const reAdopt = capability?.released === true && !installDeclared;

    const moduleUpdate =
      entry === undefined || entry.latest === undefined || entry.latest === entry.installed
        ? undefined
        : {
            installed: entry.installed,
            latest: entry.latest,
            ...(entry.blocked === undefined ? {} : { blocked: entry.blocked }),
            ...(entry.market === undefined ? {} : { market: entry.market }),
          };
    const shown = moduleUpdate === undefined ? state : 'outdated';
    const hint =
      moduleUpdate?.blocked === undefined
        ? shown === 'unknown' || shown === 'unchecked'
          ? ('panels.market.uncheckedHint' as const)
          : undefined
        : updateBlockHintOf(moduleUpdate.blocked);
    rows.push({
      id: manifest.id,
      titleKey: manifest.titleKey,
      state: shown,
      canInstall: state !== 'installed' && (install || reAdopt),
      canUpdate: onMachine && isOutdated(capability),
      canUninstall: onMachine,
      ...(hint === undefined ? {} : { hint }),
      ...(entry === undefined
        ? {}
        : { version: { installed: entry.installed, ...(entry.latest === undefined ? {} : { latest: entry.latest }) } }),
      ...(moduleUpdate === undefined ? {} : { moduleUpdate }),
      ...(entry?.market === undefined ? {} : { market: entry.market, pkg: entry.market.pkg }),
      ...(moduleUpdate === undefined ? (note === undefined ? {} : { note }) : {}),
      ...(local ? { local: true } : {}),
      defaultShown: defaults.has(manifest.id),
      defaultChanged: changed[manifest.id] ?? 0,
    });
  }
  return rows;
}
