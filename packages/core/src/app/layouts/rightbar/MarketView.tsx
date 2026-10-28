import { Fragment, createElement as h, useState } from 'react';
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
  liveManifests,
  marketCatalog,
  marketOrder,
  marketRowTitle,
  marketRows,
  marketSections,
  sharedRows,
  type InstalledWorkbenchModule,
  type MarketRow,
  type MarketRowAction,
  type SharedRow,
} from './market-rows';
import { installedPluginRows } from './market-plugin-rows';
import type { MarketNameMap, TitleResolve } from './market-names';
import { workbenchRow } from './market-workbench-row';
import { RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketMock } from './market-mock';
import type { MarketFailure } from './market-row-types';
import type { ModuleUpdateMap } from './market-rows';
import type { WorkbenchSelfUpdate, WorkbenchVersion } from '@/kernel/contract/bundle-install';
import { MarketChecking, MarketEmpty } from './MarketStates';
import { SharedSection } from './SharedSection';
import {
  heldIdOf,
  marketFootVisible,
  pendingLanded,
  pendingRowOf,
  pinnedRowOf,
  removingIdOf,
  useHeldRow,
  marketNamesOf,
  withPinnedRow,
  type Pending,
} from './market-view-text';
import { MarketSection } from './market-section';
import { marketActOf } from './market-act';
import { usePublishMarketBusy } from './market-busy';
import { useMarketDefault } from './use-market-default';
import { marketSectionIcon } from './market-section-icon';
import { MarketCheck } from '../market/market-check';
import { PanelFoot } from '@/shared/components/PanelFoot';
import styles from '../market/MarketPage.module.css';

const CONFIRM_UNINSTALL: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];
const NO_ROWS: readonly MarketRow[] = [];
const NO_UNITS: ReadonlySet<string> = new Set();

export interface MarketViewProps {
  readonly t: Translate;
  readonly titleOf: TitleResolve;
  readonly manifests: readonly UnitManifest[];
  readonly installable?: ReadonlySet<string> | null | undefined;
  readonly capabilities: CapabilityMap | null;
  readonly freshness: MarketFreshness;
  readonly onChanged: (options?: { readonly force?: boolean }) => void;
  readonly onPending?: ((pending: boolean) => void) | undefined;
  readonly updates?: ModuleUpdateMap | undefined;
  readonly updatesCheckedAt?: number | null | undefined;
  readonly updatesFailed?: boolean | undefined;
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

function ConfirmUninstall({
  t,
  name,
  onConfirm,
  onCancel,
}: {
  readonly t: Translate;
  readonly name: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <RiskConfirmation
      open={name !== null}
      title={t('panels.market.confirmUninstallTitle', { name: name ?? '' })}
      description={t('panels.market.confirmUninstallDetail')}
      acknowledgeLabel={t('panels.market.confirmUninstallAck')}
      cancelLabel={t('panels.market.confirmNo')}
      closeLabel={t('panels.market.confirmNo')}
      confirmLabel={t('panels.market.confirmYes')}
      acknowledged={acknowledged}
      onAcknowledgedChange={setAcknowledged}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function MarketBody({
  t,
  self,
  shown,
  pluginList,
  installedList,
  shared,
  pending,
  failed,
  notice,
  act,
  onConfirming,
  setDefault,
  boardBusy,
  check,
  onRecheck,
  rechecking,
}: {
  readonly t: Translate;
  readonly self: MarketRow | undefined;
  readonly shown: readonly MarketRow[];
  readonly pluginList: readonly MarketRow[];
  readonly installedList: readonly MarketRow[];
  readonly shared: readonly SharedRow[];
  readonly pending: Pending | null;
  readonly failed: MarketFailure | null;
  readonly notice: string | null;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onConfirming: (id: string | null) => void;
  readonly setDefault: (id: string, next: boolean) => Promise<void>;
  readonly boardBusy: boolean;
  readonly check: ReactNode;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  const failureOf = (id: string): MarketFailure | null => (failed?.id === id ? failed : null);
  const foot = marketFootVisible(shown, installedList);
  const sections = marketSections(
    marketOrder([...shown, ...installedList], (row) => marketRowTitle(row, t)),
  );
  const installed = sections.find((section) => section.id === 'installed');
  const pendingSection = sections.find((section) => section.id === 'not-installed');
  return (
    <>
      {notice === null ? null : <div className={styles.marketNote}>{notice}</div>}
      <MarketSection
        t={t}
        rows={self === undefined ? [] : [self]}
        onDefault={setDefault}
        boardBusy={boardBusy}
        pending={pending}
        failureOf={failureOf}
        act={act}
        confirmActions={CONFIRM_UNINSTALL}
        onConfirming={onConfirming}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
      {self === undefined ? null : (
        <div className={styles.marketSelfDivider} aria-hidden="true" />
      )}
      <MarketSection
        t={t}
        titleKey="panels.market.sectionInstalled"
        icon={marketSectionIcon('installed')}
        rows={installed?.rows ?? NO_ROWS}
        keepHead
        headAction={check}
        onDefault={setDefault}
        boardBusy={boardBusy}
        pending={pending}
        failureOf={failureOf}
        act={act}
        confirmActions={CONFIRM_UNINSTALL}
        onConfirming={onConfirming}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
      {pendingSection === undefined ? null : (
        <MarketSection
          t={t}
          titleKey={pendingSection.titleKey}
          icon={marketSectionIcon('pending')}
          rows={pendingSection.rows}
          onDefault={setDefault}
          boardBusy={boardBusy}
          pending={pending}
          failureOf={failureOf}
          act={act}
          confirmActions={CONFIRM_UNINSTALL}
          onConfirming={onConfirming}
          onRecheck={onRecheck}
          rechecking={rechecking}
        />
      )}
      <MarketSection
        t={t}
        titleKey="panels.market.sectionPlugins"
        icon={marketSectionIcon('plugins')}
        rows={pluginList}
        headAction={check}
        onDefault={setDefault}
        boardBusy={boardBusy}
        pending={pending}
        failureOf={failureOf}
        act={act}
        confirmActions={CONFIRM_UNINSTALL}
        onConfirming={onConfirming}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />

      {foot ? <PanelFoot size="md" text={t('panels.market.foot')} /> : null}

      <SharedSection
        t={t}
        rows={shared}
        pending={pending}
        failureOf={failureOf}
        act={act}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
    </>
  );
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

export function MarketView({
  t,
  titleOf,
  manifests,
  installable,
  capabilities,
  freshness,
  onChanged,
  onPending,
  updates,
  updatesCheckedAt = null,
  updatesFailed = false,
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
  const rowById = new Map(
    [...shown, ...(self === undefined ? [] : [self]), ...installedList, ...pluginList].map(
      (row) => [row.id, row] as const,
    ),
  );
  const confirmingRow = confirming === null ? undefined : rowById.get(confirming);

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
  const check = (
    <MarketCheck
      t={t}
      checkedAt={updatesCheckedAt}
      checking={checkingShown}
      failed={updatesFailed}
      disabled={pending !== null}
      onCheck={() => onChanged({ force: true })}
    />
  );

  if (!settled || ((settling?.size ?? 0) > 0 && shown.length === 0 && installedList.length === 0)) {
    return <MarketChecking t={t} />;
  }

  if (nothing) {
    return <MarketEmpty t={t} />;
  }

  return (
    <>
      <MarketBody
        t={t}
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
        check={check}
        onRecheck={recheck}
        rechecking={checkingShown}
      />

      <UninstallConfirm
        t={t}
        confirming={confirming}
        row={confirmingRow}
        onClose={() => setConfirming(null)}
        act={act}
        rowById={rowById}
      />
    </>
  );
}

function UninstallConfirm({
  t,
  confirming,
  row,
  onClose,
  act,
  rowById,
}: {
  readonly t: Translate;
  readonly confirming: string | null;
  readonly row: MarketRow | undefined;
  readonly onClose: () => void;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly rowById: ReadonlyMap<string, MarketRow>;
}) {
  return (
    <ConfirmUninstall
      key={confirming ?? ''}
      t={t}
      name={row === undefined ? null : marketRowTitle(row, t)}
      onCancel={onClose}
      onConfirm={() => {
        const id = confirming;
        onClose();
        if (id === null) return;
        const target = rowById.get(id);
        void act(
          id,
          target?.plugin === true
            ? 'uninstall-plugin'
            : target?.pkg === undefined
              ? 'uninstall'
              : 'remove-bundle',
        );
      }}
    />
  );
}
