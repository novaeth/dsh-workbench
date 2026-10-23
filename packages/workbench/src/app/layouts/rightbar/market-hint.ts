import type { ModuleVersion, WorkbenchVersion } from '@/shared/api/bundle-install';
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
}

const PROBLEM_KEY = 'panels.market.hasProblem';
const RESTART_KEY = 'panels.market.pendingRestart';
const UPDATES_KEY = 'panels.market.hasNew';

function isProblem(row: MarketRow): boolean {
  return (
    row.broken === true ||
    row.state === 'broken' ||
    row.state === 'unusable' ||
    row.note?.key === 'panels.market.moduleRefused'
  );
}

function isRestart(row: MarketRow): boolean {
  return row.state === 'inactive' || row.state === 'pending-restart';
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
  const busy = input.busy ?? new Set<string>();
  const marketable = marketCatalog(input.manifests, input.installable).filter(
    (manifest) => !busy.has(manifest.id),
  );
  const installed = (input.installed ?? []).filter((module) => !busy.has(module.unit));
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
  const restart = rows.some(isRestart) || awaitsRestart(input.manifests, installed);
  const updates = marketHasUpdates(rows, sharedRows(marketable, input.capabilities));
  const more: string[] = [];
  if (problem) {
    if (restart) more.push(RESTART_KEY);
    if (updates) more.push(UPDATES_KEY);
    return { labelKey: PROBLEM_KEY, tone: 'danger', ...(more.length === 0 ? {} : { moreKeys: more }) };
  }
  if (restart) {
    if (updates) more.push(UPDATES_KEY);
    return { labelKey: RESTART_KEY, tone: 'warning', ...(more.length === 0 ? {} : { moreKeys: more }) };
  }
  if (updates) return { labelKey: UPDATES_KEY, tone: 'warning' };
  return null;
}
