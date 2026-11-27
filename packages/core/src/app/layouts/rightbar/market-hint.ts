import type { ModuleVersion, WorkbenchSelfUpdate, WorkbenchVersion } from '@/kernel/contract/bundle-install';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { PanelHint, PanelHintTone } from '../panel-hint';
import { installedPluginRows } from './market-plugin-rows';
import type { InstalledWorkbenchModule, MarketRow } from './market-rows';
import {
  installedRows,
  marketCatalog,
  marketHasUpdates,
  marketRows,
  marketUpdatesOf,
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
  readonly selfUpdate?: WorkbenchSelfUpdate | null | undefined;
  readonly toldAt?: string | null | undefined;
  readonly busy?: ReadonlySet<string> | undefined;
  readonly installing?: boolean | undefined;
  readonly applied?: ReadonlySet<string> | undefined;
}

interface Signal {
  readonly key: string;
  readonly tone: PanelHintTone;
}

const WORKBENCH_PROBLEM_KEY = 'panels.market.workbenchProblem';
const PROBLEM_KEY = 'panels.market.hasProblem';

const RESTART_KEY = 'panels.market.pendingRestart';
const FOLLOWUP_KEY = 'panels.market.pendingFollowUp';
const UNKNOWN_KEY = 'panels.market.unchecked';
const UPDATES_KEY = 'panels.market.hasNew';

const SELF_UPDATE_NOTES: ReadonlySet<string> = new Set<string>([
  'panels.market.selfUpdateReinstallFailed',
  'panels.market.selfUpdateReinstallStopped',
]);

type ProblemKind = 'workbench' | 'module';

function problemKindOf(row: MarketRow): ProblemKind | null {
  const problem =
    row.broken === true ||
    row.state === 'broken' ||
    row.state === 'unusable' ||
    row.state === 'unsupported' ||
    (row.state === 'missing' && row.version?.installed !== undefined) ||
    row.note?.key === 'panels.market.moduleRefused' ||
    (row.workbench === true && SELF_UPDATE_NOTES.has(row.note?.key ?? ''));
  if (!problem) return null;
  return row.workbench === true ? 'workbench' : 'module';
}

function isRestart(row: MarketRow, installing: boolean): boolean {
  if (row.state === 'pending-restart') return true;
  return !installing && row.state === 'inactive';
}

function isUnknown(row: MarketRow, rosterRead: boolean): boolean {
  return row.state === 'unchecked' || (rosterRead && row.state === 'unknown');
}

export function marketHintOf(input: MarketHintInput): PanelHint | null {
  const installing = input.installing === true;
  const held = new Set([...(input.busy ?? []), ...(input.applied ?? [])]);
  const marketable = marketCatalog(input.manifests, input.installable).filter(
    (manifest) => !held.has(manifest.id),
  );
  const installed = (input.installed ?? []).filter((module) => !held.has(module.unit));
  const catalog = marketRows(
    marketable,
    input.capabilities,
    marketUpdatesOf(input.modules),
    new Set(),
    {},
    new Set(),
  );
  const listed = new Set(catalog.map((row) => row.id));
  const self = workbenchRow(input.workbench, input.selfUpdate, input.toldAt);
  const rows = [
    ...catalog,
    ...installedRows(installed, input.manifests, listed),
    ...installedPluginRows(input.plugins ?? []),
    ...(self === undefined ? [] : [self]),
  ];
  const rosterRead = input.modules !== null;
  const signal = (key: string, tone: PanelHintTone, on: boolean): readonly Signal[] =>
    on ? [{ key, tone }] : [];
  const problemKinds = new Set(rows.map((row) => problemKindOf(row)));
  const signals: readonly Signal[] = [
    ...signal(WORKBENCH_PROBLEM_KEY, 'danger', problemKinds.has('workbench')),
    ...signal(PROBLEM_KEY, 'danger', problemKinds.has('module')),
    ...signal(RESTART_KEY, 'warning', rows.some((row) => isRestart(row, installing))),
    ...signal(FOLLOWUP_KEY, 'warning', rows.some((row) => row.state === 'pending-followup')),
    ...signal(UNKNOWN_KEY, 'warning', !installing && rows.some((row) => isUnknown(row, rosterRead))),
    ...signal(
      UPDATES_KEY,
      'warning',
      marketHasUpdates(rows, sharedRows(marketable, input.capabilities)),
    ),
  ];
  const [first, ...rest] = signals;
  if (first === undefined) return null;
  return {
    labelKey: first.key,
    tone: first.tone,
    ...(rest.length === 0 ? {} : { moreKeys: rest.map((one) => one.key) }),
  };
}
