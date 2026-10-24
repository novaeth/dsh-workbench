import { Fragment, createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
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
import { workbenchRow } from './market-workbench-row';
import { RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketMock } from './market-mock';
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
  useMarketTitles,
  withPinnedRow,
  type Pending,
} from './market-view-text';
import { machineBoardSignature, useBoardSettle } from './panel-write';
import { MarketSection } from './market-section';
import { marketActOf } from './market-act';
import { usePublishMarketBusy } from './market-busy';
import { marketSectionIcon } from './market-section-icon';
import { PanelFoot } from '@/shared/components/PanelFoot';
import styles from '../market/MarketPage.module.css';

const CONFIRM_UNINSTALL: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];

export interface MarketViewProps {
  readonly t: Translate;
  readonly manifests: readonly UnitManifest[];
  readonly installable?: ReadonlySet<string> | null | undefined;
  readonly capabilities: CapabilityMap | null;
  readonly freshness: MarketFreshness;
  readonly onChanged: (options?: { readonly force?: boolean }) => void;
  readonly onPending?: ((pending: boolean) => void) | undefined;
  readonly updates?: ModuleUpdateMap | undefined;
  readonly installed?: readonly InstalledWorkbenchModule[] | undefined;
  readonly installedRead?: boolean | undefined;
  readonly workbench?: WorkbenchVersion | null | undefined;
  readonly selfUpdate?: WorkbenchSelfUpdate | null | undefined;
  readonly plugins?: readonly InstalledPlugin[] | null | undefined;
  readonly settling?: ReadonlySet<string> | undefined;
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
}: {
  readonly t: Translate;
  readonly self: MarketRow | undefined;
  readonly shown: readonly MarketRow[];
  readonly pluginList: readonly MarketRow[];
  readonly installedList: readonly MarketRow[];
  readonly shared: readonly SharedRow[];
  readonly pending: Pending | null;
  readonly failed: { readonly id: string; readonly message: string } | null;
  readonly notice: string | null;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onConfirming: (id: string | null) => void;
  readonly setDefault: (id: string, next: boolean) => Promise<void>;
  readonly boardBusy: boolean;
}) {
  const failureOf = (id: string): string | null => (failed?.id === id ? failed.message : null);
  const foot = marketFootVisible(shown, installedList);
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
      />
      {self === undefined ? null : (
        <div className={styles.marketSelfDivider} aria-hidden="true" />
      )}
      {marketSections(
        marketOrder([...shown, ...installedList], (row) => marketRowTitle(row, t)),
      ).map((section) => (
        <MarketSection
          key={section.id}
          t={t}
          titleKey={section.titleKey}
          icon={marketSectionIcon(section.id === 'installed' ? 'installed' : 'pending')}
          rows={section.rows}
          onDefault={setDefault}
          boardBusy={boardBusy}
          pending={pending}
          failureOf={failureOf}
          act={act}
          confirmActions={CONFIRM_UNINSTALL}
          onConfirming={onConfirming}
        />
      ))}
      <MarketSection
        t={t}
        titleKey="panels.market.sectionPlugins"
        icon={marketSectionIcon('plugins')}
        rows={pluginList}
        onDefault={setDefault}
        boardBusy={boardBusy}
        pending={pending}
        failureOf={failureOf}
        act={act}
        confirmActions={CONFIRM_UNINSTALL}
        onConfirming={onConfirming}
      />

      {foot ? <PanelFoot size="md" text={t('panels.market.foot')} /> : null}

      <SharedSection t={t} rows={shared} pending={pending} failureOf={failureOf} act={act} />
    </>
  );
}


function useMarketScene(input: {
  readonly manifests: readonly UnitManifest[];
  readonly installable: ReadonlySet<string> | null | undefined;
  readonly capabilities: CapabilityMap | null;
  readonly updates: ModuleUpdateMap | undefined;
  readonly installed: readonly InstalledWorkbenchModule[] | undefined;
  readonly settling: ReadonlySet<string> | undefined;
  readonly mock: MarketMock | undefined;
  readonly defaults: readonly string[];
  readonly changed: Readonly<Record<string, number>>;
  readonly pending: Pending | null;
  readonly failed: { readonly id: string } | null;
}): {
  readonly titles: ReadonlyMap<string, string>;
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
  const { manifests, installable, capabilities, updates, installed, settling, mock, defaults, changed, pending, failed } = input;
  const titles = useMarketTitles(manifests, mock !== undefined);
  const catalog = mock?.manifests ?? manifests;
  const marketable = mock === undefined ? marketCatalog(manifests, installable) : catalog;
  const effective = mock === undefined ? capabilities : mock.capabilities;
  const installedIds = installedIdSet(mock === undefined ? installed : undefined);
  const source = liveManifests(marketable, effective, installedIds);
  const byDefault = new Set(defaults);
  const updateMap = mock?.updates ?? updates ?? {};
  const rows = marketRows(source, effective, updateMap, byDefault, changed);
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
    titles,
    byDefault,
    changed,
  );
  return { titles, catalog, effective, updateMap, rows, shared, installedList, byDefault, steady, pinned, removing, busyId };
}

export function MarketView({
  t,
  manifests,
  installable,
  capabilities,
  freshness,
  onChanged,
  onPending,
  updates,
  installed,
  installedRead,
  workbench,
  selfUpdate,
  plugins,
  settling,
  mock,
  defaults = [],
  changed = {},
}: MarketViewProps) {
  const { pending, setPending, confirming, setConfirming, failed, setFailed, notice, setNotice } =
    useMarketTransient({ mock, onPending });
  const { titles, effective, updateMap, rows, shared, installedList, byDefault, steady, pinned, removing, busyId } =
    useMarketScene({
      manifests,
      installable,
      capabilities,
      updates,
      installed,
      settling,
      mock,
      defaults,
      changed,
      pending,
      failed,
    });
  usePublishMarketBusy(busyId);
  const provision = useHostWrite({ channel: 'provision', networkText: t('panels.failed') });
  const boardWrite = useHostWrite<unknown>({
    channel: 'prefs',
    resource: 'panels',
    networkText: t('panels.failed'),
  });
  const [writingDefault, setWritingDefault] = useState(false);
  const settleDefault = useBoardSettle(machineBoardSignature(defaults, changed));
  const { busy: boardBusy } = useVisibleBusy(writingDefault || settleDefault.pending, MIN_BUSY_MS);

  const setDefault = async (id: string, next: boolean): Promise<void> => {
    if (mock !== undefined) return;
    setWritingDefault(true);
    settleDefault.begin();
    const outcome = await boardWrite.send({ action: next ? 'show' : 'hide', id, scope: 'machine' });
    setWritingDefault(false);
    if (!outcome.ok) {
      settleDefault.clear();
      setNotice(t('panels.failed'));
    }
  };
  const pendingRow = pendingRowOf({ pending, removing, rows, titles });
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

  const landed = pendingLanded(pending, updateMap, effective, workbench?.installed, shared, pluginSource === null ? null : pluginList);
  useSettleHold({ pending, landed, t, onChanged, selfUpdate: mock?.selfUpdate ?? selfUpdate, setPending, setFailed });
  const settled = marketSettled(freshness, installedRead);
  const nothing =
    shown.length === 0 &&
    self === undefined &&
    installedList.length === 0 &&
    pluginList.length === 0;

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
      />

      <ConfirmUninstall
        key={confirming ?? ''}
        t={t}
        name={confirmingRow === undefined ? null : marketRowTitle(confirmingRow, t)}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const id = confirming;
          setConfirming(null);
          if (id === null) return;
          const row = rowById.get(id);
          void act(
            id,
            row?.plugin === true
              ? 'uninstall-plugin'
              : row?.pkg === undefined
                ? 'uninstall'
                : 'remove-bundle',
          );
        }}
      />
    </>
  );
}
