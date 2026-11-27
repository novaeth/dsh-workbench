import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { UnitManifest } from '@dsh-workbench/shared';
import { useHostWrite } from '@/shared/hooks/use-host-write';

import type { CapabilityMap } from '@/shared/hooks/use-capabilities';

import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';

import { marketSettled } from './market-freshness';
import { useMarketChecks } from './use-market-checks';
import { installedToShow } from './market-installed-list';

import { useSelfUpdateBusyRefresh, useSelfUpdateTold, useSettleHold } from './market-settle-hold';
import { useMarketTransient } from './market-transient-state';
import { useMarketDetail } from './use-market-detail';
import { detailDependenciesFor } from './market-detail-deps';
import { marketNothingOf, marketPluginReadOf } from './market-plugins-held';
import { marketLandedOf } from './market-landed';
import type { MarketFreshness } from './market-freshness';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import {
  checkingRows,
  installedIdSet,
  installedRows,
  liveManifests,
  marketCatalog,
  marketRows,
  sharedRows,
  type InstalledWorkbenchModule,
  type MarketRow,
  type SharedRow,
} from './market-rows';
import { MarketSceneView } from './market-scene-view';
import type { MarketNameMap, TitleResolve } from './market-names';
import { workbenchRow } from './market-workbench-row';
import type { MarketFailure } from './market-row-types';
import type { ModuleUpdateMap } from './market-rows';
import type { WorkbenchSelfUpdate, WorkbenchVersion } from '@/kernel/contract/bundle-install';
import {
  heldIdOf,
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
import type { VersionsCheck, VersionsPart } from '../market/use-module-versions';
import type { MarketReloadOptions } from '../market/use-market-reload';

const NO_UNITS: ReadonlySet<string> = new Set();

export interface MarketViewProps {
  readonly t: Translate;
  readonly titleOf: TitleResolve;
  readonly manifests: readonly UnitManifest[];
  readonly installable?: ReadonlySet<string> | null | undefined;
  readonly capabilities: CapabilityMap | null;
  readonly runtimePluginMarket?: boolean | undefined;
  readonly freshness: MarketFreshness;
  readonly onChanged: (options?: MarketReloadOptions) => void;
  readonly onPending?: ((pending: boolean) => void) | undefined;
  readonly updates?: ModuleUpdateMap | undefined;
  readonly modulesCheck?: VersionsCheck | undefined;
  readonly pluginsCheck?: VersionsCheck | undefined;
  readonly marketProblem?: boolean | undefined;
  readonly onCheck?: ((part: VersionsPart) => void) | undefined;
  readonly installed?: readonly InstalledWorkbenchModule[] | undefined;
  readonly unreadable?: readonly { readonly pkg: string; readonly reason: string }[] | undefined;
  readonly readFailure?: string | null | undefined;
  readonly readStale?: boolean | undefined;
  readonly installedRead?: boolean | undefined;
  readonly workbench?: WorkbenchVersion | null | undefined;
  readonly selfUpdate?: WorkbenchSelfUpdate | null | undefined;
  readonly plugins?: readonly InstalledPlugin[] | null | undefined;
  readonly settling?: ReadonlySet<string> | undefined;
  readonly installing?: boolean | undefined;
  readonly defaults?: readonly string[] | undefined;
  readonly changed?: Readonly<Record<string, number>> | undefined;
  readonly onDetailChange?: ((open: boolean) => void) | undefined;
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
  readonly defaults: readonly string[];
  readonly changed: Readonly<Record<string, number>>;
  readonly pending: Pending | null;
  readonly failed: MarketFailure | null;
  readonly heldPlugins: ReadonlySet<string>;
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
  const { t, titleOf, manifests, installable, capabilities, updates, installed, settling, defaults, changed, pending, failed, heldPlugins } = input;
  const names = marketNamesOf(t, installed ?? [], titleOf);
  const catalog = manifests;
  const marketable = marketCatalog(manifests, installable);
  const effective = capabilities;
  const installedIds = installedIdSet(installed);
  const source = liveManifests(marketable, effective, installedIds);
  const byDefault = new Set(defaults);
  const updateMap = updates ?? {};
  const rows = checkingRows(marketRows(source, effective, updateMap, byDefault, changed, heldPlugins), {
    units: settling ?? NO_UNITS,
  });
  const shared = sharedRows(source, effective);
  const removing = removingIdOf(pending, failed);
  const steady = useHeldRow(pending, (id) => catalog.some((manifest) => manifest.id === id));
  const pinned = pinnedRowOf(pending, steady.held);
  const busyId = heldIdOf(pending, steady.held);
  const listedIds = new Set(rows.map((row) => row.id));
  const installedList = installedRows(
    installedToShow(installed ?? [], {
      listed: listedIds,
      settling: settling ?? NO_UNITS,
      ...(busyId === null ? {} : { busyId }),
      ...(pinned === undefined ? {} : { pinnedId: pinned.id }),
      ...(removing === null ? {} : { removing }),
    }),
    catalog,
    listedIds,
    names,
    byDefault,
    changed,
  );
  return { names, catalog, effective, updateMap, rows, shared, installedList, byDefault, steady, pinned, removing, busyId };
}

function workbenchSelfOf(input: {
  readonly workbench: WorkbenchVersion | null | undefined;
  readonly selfUpdate?: WorkbenchSelfUpdate | null | undefined;
  readonly toldAt?: string | null | undefined;
}): MarketRow | undefined {
  return workbenchRow(input.workbench, input.selfUpdate, input.toldAt);
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
  marketProblem = false,
  onCheck,
  installed,
  unreadable = [],
  readFailure = null,
  readStale = false,
  installedRead,
  workbench,
  selfUpdate,
  plugins,
  settling,
  installing = false,
  defaults = [],
  changed = {},
  onDetailChange,
}: MarketViewProps) {
  const { pending, setPending, confirming, setConfirming, failed, setFailed, notice, setNotice } =
    useMarketTransient({ onPending });
  const { source: pluginSource, rows: pluginList, held: heldPlugins } = marketPluginReadOf(
    plugins ?? null,
    new Set(defaults),
    changed,
  );
  const { names, effective, updateMap, rows, shared, installedList, steady, pinned, removing, busyId } =
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
      defaults,
      changed,
      pending,
      failed,
      heldPlugins,
    });
  usePublishMarketBusy(busyId);
  const provision = useHostWrite({ channel: 'provision', networkText: t('panels.failed') });
  const { pending: defaultPending, setDefault } = useMarketDefault({
    t,
    defaults,
    changed,
    setNotice,
  });
  const { busy: boardBusy } = useVisibleBusy(defaultPending, MIN_BUSY_MS);
  const effectiveSelfUpdate = selfUpdate;
  const selfUpdateTold = useSelfUpdateTold(effectiveSelfUpdate, true);
  const pendingRow = pendingRowOf({ pending, removing, rows, names });
  const self = workbenchSelfOf({
    workbench,
    selfUpdate: effectiveSelfUpdate,
    toldAt: selfUpdateTold,
  });
  const shown = withPinnedRow(pendingRow === undefined ? rows : [...rows, pendingRow], pinned);
  const rowById = marketRowMap(shown, self, installedList, pluginList);
  const confirmingRow = confirming === null ? undefined : rowById.get(confirming);
  const { setDetailId, detailRow, detailShared } = useMarketDetail(
    rowById,
    shared,
    onDetailChange,
  );

  const seats = { setPending, setHeld: steady.hold, setConfirming, setFailed, setNotice };
  const act = marketActOf({
    t,
    rowOf: (id) => rowById.get(id),
    seats,
    send: (body) => provision.send(body),
    onChanged,
  });

  const landed = marketLandedOf({
    pending,
    updates: updateMap,
    capabilities: effective,
    installedVersion: workbench?.installed,
    shared,
    pluginSource,
    pluginList,
    installed,
  });
  useSettleHold({ pending, landed, t, onChanged, selfUpdate: effectiveSelfUpdate, setPending, setFailed });
  useSelfUpdateBusyRefresh(effectiveSelfUpdate?.busy === true, onChanged);
  const nothing = marketNothingOf(shown, self, installedList, pluginList);
  const listUnread = unreadable.length === 0 && readFailure !== null;
  const { checks, recheck, rechecking: checkingShown } = useMarketChecks({ t, installed, plugins, modulesCheck, pluginsCheck, pending, onCheck, onChanged, setFailed, checking: freshness.checking, marketProblem });

  return (
    <MarketSceneView
      t={t}
      runtimePluginMarket={runtimePluginMarket}
      self={self}
      shown={shown}
      pluginList={pluginList}
      installedList={installedList}
      unreadable={unreadable}
      readStale={readStale}
      pending={pending}
      failed={failed}
      notice={notice}
      readFailure={listUnread ? readFailure : null}
      act={act}
      onConfirming={setConfirming}
      setDefault={setDefault}
      boardBusy={boardBusy}
      checks={checks}
      onRecheck={recheck}
      rechecking={checkingShown}
      onOpenDetail={setDetailId}
      detailRow={detailRow}
      detailDependencies={
        detailRow === undefined ? [] : detailDependenciesFor(effective, manifests, detailRow.id)
      }
      detailShared={detailShared}
      confirming={confirming}
      confirmingRow={confirmingRow}
      rowById={rowById}
      settled={marketSettled(freshness, installedRead)}
      nothing={nothing}
      settlingSize={settling?.size ?? 0}
      onBack={() => setDetailId(null)}
    />
  );
}
