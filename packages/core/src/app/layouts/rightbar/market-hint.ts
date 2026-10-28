import type { ModuleVersion, WorkbenchVersion } from '@/kernel/contract/bundle-install';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { PanelHint } from '../panel-hint';
import { installedPluginRows } from './market-plugin-rows';
import type { InstalledWorkbenchModule, MarketRow } from './market-rows';
import {
  installedRows,
  marketCatalog,
  marketHasUpdates,
  marketRows,
  marketUpdatesOf,
  refusalReasons,
  sharedRows,
} from './market-rows';
import { workbenchRow } from './market-workbench-row';

export interface MarketHintInput {
  readonly manifests: readonly UnitManifest[];
  readonly installable?: ReadonlySet<string> | null | undefined;
  readonly capabilities: CapabilityMap | null;
  readonly modules: readonly ModuleVersion[] | null;
  readonly installed?: readonly InstalledWorkbenchModule[] | undefined;
  readonly plugins?: readonly InstalledPlugin[] | null | undefined;
  readonly workbench?: WorkbenchVersion | null | undefined;
  readonly busy?: ReadonlySet<string> | undefined;
  readonly installing?: boolean | undefined;
  readonly applied?: ReadonlySet<string> | undefined;
}

const PROBLEM_KEY = 'panels.market.hasProblem';
const RESTART_KEY = 'panels.market.pendingRestart';
const FOLLOWUP_KEY = 'panels.market.pendingFollowUp';
const UNKNOWN_KEY = 'panels.market.unchecked';
const UPDATES_KEY = 'panels.market.hasNew';

function isProblem(row: MarketRow): boolean {
  return (
    row.broken === true ||
    row.state === 'broken' ||
    row.state === 'unusable' ||
    row.note?.key === 'panels.market.moduleRefused'
  );
}

function isRestart(row: MarketRow, installing: boolean): boolean {
  if (row.state === 'pending-restart') return true;
  return !installing && row.state === 'inactive';
}

function isUnknown(row: MarketRow, rosterRead: boolean): boolean {
  return row.state === 'unchecked' || (rosterRead && row.state === 'unknown');
}

function awaitsRestart(
  manifests: readonly UnitManifest[],
  installed: readonly InstalledWorkbenchModule[],
): boolean {
  const loaded = new Set(manifests.map((manifest) => manifest.id));
  return installed.some(
    (module) =>
      !loaded.has(module.unit) && refusalReasons(module.refused, module.clientRefused).length === 0,
  );
}

export function marketHintOf(input: MarketHintInput): PanelHint | null {
  const installing = input.installing === true;
  const held = new Set([...(input.busy ?? []), ...(input.applied ?? [])]);
  const marketable = marketCatalog(input.manifests, input.installable).filter(
    (manifest) => !held.has(manifest.id),
  );
  const installed = (input.installed ?? []).filter((module) => !held.has(module.unit));
  const catalog = marketRows(marketable, input.capabilities, marketUpdatesOf(input.modules));
  const listed = new Set(catalog.map((row) => row.id));
  const self = workbenchRow(input.workbench);
  const rows = [
    ...catalog,
    ...installedRows(installed, input.manifests, listed),
    ...installedPluginRows(input.plugins ?? []),
    ...(self === undefined ? [] : [self]),
  ];
  const problem = rows.some(isProblem);
  const restart =
    rows.some((row) => isRestart(row, installing)) ||
    (!installing && awaitsRestart(input.manifests, installed));
  const followUp = rows.some((row) => row.state === 'pending-followup');
  const rosterRead = input.modules !== null;
  const unknown = !installing && rows.some((row) => isUnknown(row, rosterRead));
  const updates = marketHasUpdates(rows, sharedRows(marketable, input.capabilities));
  const more: string[] = [];
  if (problem) {
    if (restart) more.push(RESTART_KEY);
    if (followUp) more.push(FOLLOWUP_KEY);
    if (unknown) more.push(UNKNOWN_KEY);
    if (updates) more.push(UPDATES_KEY);
    return { labelKey: PROBLEM_KEY, tone: 'danger', ...(more.length === 0 ? {} : { moreKeys: more }) };
  }
  if (restart) {
    if (followUp) more.push(FOLLOWUP_KEY);
    if (unknown) more.push(UNKNOWN_KEY);
    if (updates) more.push(UPDATES_KEY);
    return { labelKey: RESTART_KEY, tone: 'warning', ...(more.length === 0 ? {} : { moreKeys: more }) };
  }
  if (followUp) {
    if (unknown) more.push(UNKNOWN_KEY);
    if (updates) more.push(UPDATES_KEY);
    return { labelKey: FOLLOWUP_KEY, tone: 'warning', ...(more.length === 0 ? {} : { moreKeys: more }) };
  }
  if (unknown) {
    if (updates) more.push(UPDATES_KEY);
    return { labelKey: UNKNOWN_KEY, tone: 'warning', ...(more.length === 0 ? {} : { moreKeys: more }) };
  }
  if (updates) return { labelKey: UPDATES_KEY, tone: 'warning' };
  return null;
}
