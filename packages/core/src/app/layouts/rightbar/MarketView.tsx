import { createElement as h, useState } from 'react';
import type { ReactNode, Translate } from '@dsh-workbench/shared';
import type { UnitManifest } from '@dsh-workbench/shared';
import { useHostWrite } from '@/shared/hooks/use-host-write';

import type { CapabilityMap } from '@/shared/hooks/use-capabilities';

import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';

import { marketSettled } from './market-freshness';
import { useSettleHold } from './market-settle-hold';
import { useMarketTransient } from './market-transient-state';
import type { MarketFreshness } from './market-freshness';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import {
  checkingRows,
  installedIdSet,
  installedRows,
  checkedPluginCount,
  latestCheckSummary,
  liveManifests,
  marketCatalog,
  marketRows,
  sharedRows,
  type InstalledWorkbenchModule,
  type LatestCheckSummary,
  type MarketRow,
  type SharedRow,
} from './market-rows';
import { installedPluginRows } from './market-plugin-rows';
import { MarketSceneView } from './market-scene-view';
import type { MarketNameMap, TitleResolve } from './market-names';
import { workbenchRow } from './market-workbench-row';
import type { MarketMock } from './market-mock';
import type { MarketFailure } from './market-row-types';
import type { ModuleUpdateMap } from './market-rows';
import type { WorkbenchSelfUpdate, WorkbenchVersion } from '@/kernel/contract/bundle-install';
import {
  heldIdOf,
  pendingLanded,
  pendingRowOf,
  pinnedRowOf,
  removingIdOf,
  useHeldRow,
  marketNamesOf,
  marketRowMap,
  withPinnedRow,
  type Pending,
} from './market-view-text';
import { marketActOf } from './market-act';
import { usePublishMarketBusy } from './market-busy';
import { useMarketDefault } from './use-market-default';
import { SectionCheck } from '../market/section-check';
import type { VersionsCheck, VersionsPart } from '../market/use-module-versions';

const NO_CHECK: VersionsCheck = { checking: false, failed: false, checkedAt: null };
const NO_UNITS: ReadonlySet<string> = new Set();

export interface MarketViewProps {
  readonly t: Translate;
  readonly titleOf: TitleResolve;
  readonly manifests: readonly UnitManifest[];
  readonly installable?: ReadonlySet<string> | null | undefined;
  readonly capabilities: CapabilityMap | null;
  readonly runtimePluginMarket?: boolean | undefined;
  readonly freshness: MarketFreshness;
  readonly onChanged: (options?: { readonly force?: boolean }) => void;
  readonly onPending?: ((pending: boolean) => void) | undefined;
  readonly updates?: ModuleUpdateMap | undefined;
  readonly modulesCheck?: VersionsCheck | undefined;
  readonly pluginsCheck?: VersionsCheck | undefined;
  readonly onCheck?: ((part: VersionsPart) => void) | undefined;
  readonly installed?: readonly InstalledWorkbenchModule[] | undefined;
  readonly installedRead?: boolean | undefined;
  readonly workbench?: WorkbenchVersion | null | undefined;
  readonly selfUpdate?: WorkbenchSelfUpdate | null | undefined;
  readonly plugins?: readonly InstalledPlugin[] | null | undefined;
  readonly settling?: ReadonlySet<string> | undefined;
  readonly installing?: boolean | undefined;
  readonly mock?: MarketMock | undefined;
  readonly defaults?: readonly string[] | undefined;
  readonly changed?: Readonly<Record<string, number>> | undefined;
}


function useMarketScene(input: {
  readonly t: Translate;
  readonly titleOf: TitleResolve;
  readonly manifests: readonly UnitManifest[];
  readonly installable: ReadonlySet<string> | null | undefined;
  readonly capabilities: CapabilityMap | null;
  readonly updates: ModuleUpdateMap | undefined;
  readonly installed: readonly InstalledWorkbenchModule[] | undefined;
  readonly settling: ReadonlySet<string> | undefined;
  readonly installing: boolean;
  readonly mock: MarketMock | undefined;
  readonly defaults: readonly string[];
  readonly changed: Readonly<Record<string, number>>;
  readonly pending: Pending | null;
  readonly failed: MarketFailure | null;
}): {
  readonly names: MarketNameMap;
  readonly catalog: readonly UnitManifest[];
  readonly effective: CapabilityMap | null;
  readonly updateMap: ModuleUpdateMap;
  readonly rows: MarketRow[];
  readonly shared: SharedRow[];
  readonly installedList: MarketRow[];
  readonly byDefault: ReadonlySet<string>;
  readonly steady: ReturnType<typeof useHeldRow>;
  readonly pinned: MarketRow | undefined;
  readonly removing: string | null;
  readonly busyId: string | null;
} {
  const { t, titleOf, manifests, installable, capabilities, updates, installed, settling, installing, mock, defaults, changed, pending, failed } = input;
  const names = marketNamesOf(t, installed ?? [], titleOf, mock !== undefined);
  const catalog = mock?.manifests ?? manifests;
  const marketable = mock === undefined ? marketCatalog(manifests, installable) : catalog;
  const effective = mock === undefined ? capabilities : mock.capabilities;
  const installedIds = installedIdSet(mock === undefined ? installed : undefined);
  const source = liveManifests(marketable, effective, installedIds);
  const byDefault = new Set(defaults);
  const updateMap = mock?.updates ?? updates ?? {};
  const rows = checkingRows(marketRows(source, effective, updateMap, byDefault, changed), {
    all: installing,
    units: settling ?? NO_UNITS,
  });
  const shared = sharedRows(source, effective);
  const removing = removingIdOf(pending, failed);
  const steady = useHeldRow(pending, (id) => catalog.some((manifest) => manifest.id === id));
  const pinned = pinnedRowOf(pending, steady.held);
  const busyId = heldIdOf(pending, steady.held);
  const installedList = installedRows(
    (mock?.installed ?? installed ?? []).filter(
      (module) =>
        module.unit !== pinned?.id &&
        ((!(settling?.has(module.unit) ?? false) || module.unit === busyId) && module.unit !== removing),
    ),
    catalog,
    new Set(rows.map((row) => row.id)),
    mock === undefined ? names : undefined,
    byDefault,
    changed,
  );
  return { names, catalog, effective, updateMap, rows, shared, installedList, byDefault, steady, pinned, removing, busyId };
}

function sectionChecksOf(input: {
  readonly t: Translate;
  readonly modules?: VersionsCheck | undefined;
  readonly plugins?: VersionsCheck | undefined;
  readonly latestModules: LatestCheckSummary;
  readonly latestPlugins: LatestCheckSummary;
  readonly disabled: boolean;
  readonly onCheck?: ((part: VersionsPart) => void) | undefined;
}): Readonly<Record<VersionsPart, ReactNode>> {
  return {
    modules: (
      <SectionCheck
        t={input.t}
        part="modules"
        seat={input.modules ?? NO_CHECK}
        latest={input.latestModules}
        disabled={input.disabled}
        onCheck={input.onCheck}
      />
    ),
    plugins: (
      <SectionCheck
        t={input.t}
        part="plugins"
        seat={input.plugins ?? NO_CHECK}
        latest={input.latestPlugins}
        disabled={input.disabled}
        onCheck={input.onCheck}
      />
    ),
  };
}

export function MarketView({
  t,
  titleOf,
  manifests,
  installable,
  capabilities,
  runtimePluginMarket,
  freshness,
  onChanged,
  onPending,
  updates,
  modulesCheck,
  pluginsCheck,
  onCheck,
  installed,
  installedRead,
  workbench,
  selfUpdate,
  plugins,
  settling,
  installing = false,
  mock,
  defaults = [],
  changed = {},
}: MarketViewProps) {
  const { pending, setPending, confirming, setConfirming, failed, setFailed, notice, setNotice } =
    useMarketTransient({ mock, onPending });
  const [detailId, setDetailId] = useState<string | null>(null);
  const { names, effective, updateMap, rows, shared, installedList, byDefault, steady, pinned, removing, busyId } =
    useMarketScene({
      t,
      titleOf,
      manifests,
      installable,
      capabilities,
      updates,
      installed,
      settling,
      installing,
      mock,
      defaults,
      changed,
      pending,
      failed,
    });
  usePublishMarketBusy(busyId);
  const provision = useHostWrite({ channel: 'provision', networkText: t('panels.failed') });
  const { pending: defaultPending, setDefault } = useMarketDefault({
    t,
    mocked: mock !== undefined,
    defaults,
    changed,
    setNotice,
  });
  const { busy: boardBusy } = useVisibleBusy(defaultPending, MIN_BUSY_MS);
  const pendingRow = pendingRowOf({ pending, removing, rows, names });
  const self = workbenchRow(mock === undefined ? workbench : mock.workbench);
  const shown = withPinnedRow(pendingRow === undefined ? rows : [...rows, pendingRow], pinned);
  const pluginSource = mock?.plugins ?? plugins ?? null;
  const pluginList = installedPluginRows(pluginSource ?? [], byDefault, changed);
  const rowById = marketRowMap(shown, self, installedList, pluginList);
  const confirmingRow = confirming === null ? undefined : rowById.get(confirming);
  const detailRow = detailId === null ? undefined : rowById.get(detailId);

  const seats = { setPending, setHeld: steady.hold, setConfirming, setFailed, setNotice };
  const act = marketActOf({
    t,
    mocked: mock !== undefined,
    rowOf: (id) => rowById.get(id),
    seats,
    send: (body) => provision.send(body),
    onChanged,
  });

  const landed = pendingLanded(
    pending,
    updateMap,
    effective,
    workbench?.installed,
    shared,
    pluginSource === null ? null : pluginList,
    {
      units: installed === undefined ? null : new Set(installed.map((module) => module.unit)),
      plugins: pluginSource === null ? null : new Set(pluginList.map((row) => row.id)),
    },
  );
  const effectiveSelfUpdate = mock?.selfUpdate ?? selfUpdate;
  useSettleHold({ pending, landed, t, onChanged, selfUpdate: effectiveSelfUpdate, setPending, setFailed });
  const settled = marketSettled(freshness, installedRead);
  const nothing =
    shown.length === 0 && self === undefined && installedList.length === 0 && pluginList.length === 0;
  const { busy: checkingShown } = useVisibleBusy(freshness.checking, MIN_BUSY_MS);
  const recheck = () => {
    setFailed(null);
    if (mock === undefined) onChanged({ force: true });
  };
  const checks = sectionChecksOf({
    t,
    modules: modulesCheck,
    plugins: pluginsCheck,
    latestModules: latestCheckSummary(mock?.installed ?? installed),
    latestPlugins: { checked: checkedPluginCount(mock?.plugins ?? plugins), unknown: 0 },
    disabled: pending !== null,
    onCheck: mock === undefined ? onCheck : undefined,
  });

  return (
    <MarketSceneView
      t={t}
      runtimePluginMarket={runtimePluginMarket}
      self={self}
      shown={shown}
      pluginList={pluginList}
      installedList={installedList}
      shared={shared}
      pending={pending}
      failed={failed}
      notice={notice}
      act={act}
      onConfirming={setConfirming}
      setDefault={setDefault}
      boardBusy={boardBusy}
      checks={checks}
      onRecheck={recheck}
      rechecking={checkingShown}
      onOpenDetail={setDetailId}
      detailRow={detailRow}
      confirming={confirming}
      confirmingRow={confirmingRow}
      rowById={rowById}
      settled={settled}
      nothing={nothing}
      settlingSize={settling?.size ?? 0}
      onBack={() => setDetailId(null)}
    />
  );
}
