import { createElement as h, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { DshClientContext } from '@dsh-workbench/shared';
import type { ClientUnitRegistry } from '@/kernel/client/registry';
import type { Translate } from '@dsh-workbench/shared';
import type { UnitManifest } from '@dsh-workbench/shared';
import { IconModules } from '@/shared/components/IconModules';
import { useCapabilityMap } from '@/shared/hooks/use-capability-gate';

import { LOCALE_NS } from '@dsh-workbench/shared';
import { publishPanelHint } from '../panel-hint';
import { marketSettled, type MarketFreshness } from '../rightbar/market-freshness';
import { marketUpdatesOf, withClientRefusals } from '../rightbar/market-rows';
import { marketHintOf } from '../rightbar/market-hint';
import { useSelfUpdateTold } from '../rightbar/market-settle-hold';
import { useMarketBusy } from '../rightbar/market-busy';
import { useMarketInstallState } from '../rightbar/market-install';
import { MarketView } from '../rightbar/MarketView';
import { pluginMarketOf, useRuntimeCapabilities } from '@/shared/hooks/use-runtime-capabilities';
import type { TitleResolve } from '../rightbar/market-names';
import { DiscoverPanel } from './DiscoverPanel';
import { MarketHeader } from './market-header';
import { useMarketTab } from './market-tab';
import { useEnabledUnits } from '../rightbar/use-panels';
import { moduleVersionsCheckedAt, useModuleVersions } from './use-module-versions';
import { useMarketReload } from './use-market-reload';
import { useMarketPanelScroll } from './use-market-panel-scroll';
import { AddModuleDialog } from './AddModuleDialog';
import type { AddModulePreset } from './use-add-module';
import styles from './MarketPage.module.css';

export const MARKET_PANEL_ID = 'workbench-market';

function useLiveManifests(units: ClientUnitRegistry): readonly UnitManifest[] {
  const subscribe = useCallback((listener: () => void) => units.subscribe(listener), [units]);
  const revision = useCallback(() => units.version(), [units]);
  useSyncExternalStore(subscribe, revision);
  return units.manifests();
}

function useInstallableUnits(units: ClientUnitRegistry): ReadonlySet<string> | null {
  const subscribe = useCallback((listener: () => void) => units.subscribe(listener), [units]);
  const revision = useCallback(() => units.version(), [units]);
  useSyncExternalStore(subscribe, revision);
  return units.installable();
}

function makeMarketEntryIcon(units: ClientUnitRegistry) {
  return function MarketEntryIcon({ size = 16 }: { size?: number }) {
    const manifests = useLiveManifests(units);
    const installable = useInstallableUnits(units);
    const { capabilities } = useCapabilityMap(0);
    const { modules, plugins, workbench, selfUpdate } = useModuleVersions();
    const toldAt = useSelfUpdateTold(selfUpdate);
    const installed = modules === null ? undefined : withClientRefusals(modules, units.refusals());
    const busy = useMarketBusy();
    const install = useMarketInstallState();
    const hint = marketHintOf({
      manifests,
      installable,
      capabilities,
      modules,
      installed,
      plugins,
      workbench,
      selfUpdate,
      toldAt,
      busy,
      ...install,
    });

    useEffect(() => {
      publishPanelHint(MARKET_PANEL_ID, hint);
    }, [hint]);

    useEffect(
      () => () => {
        publishPanelHint(MARKET_PANEL_ID, null);
      },
      [],
    );

    return <IconModules size={size} />;
  };
}

function MarketPanel({
  t,
  units,
  titleOf,
}: {
  t: Translate;
  units: ClientUnitRegistry;
  titleOf: TitleResolve;
}) {
  const manifests = useLiveManifests(units);
  const installable = useInstallableUnits(units);
  const { capabilities, checkedAt, checking, forceProbe, reload: reloadCapability } = useCapabilityMap(0);
  const versions = useModuleVersions();
  const {
    modules,
    unreadable,
    readFailure,
    stale: versionsStale,
    plugins,
    workbench,
    selfUpdate,
    checking: versionsChecking,
    allChecking: versionsAllChecking,
    modulesCheck,
    pluginsCheck,
    marketProblem,
    read: installedRead,
    reload: reloadVersions,
  } = versions;
  const machineBoard = useEnabledUnits(0, null);
  const install = useMarketInstallState();
  const runtimeCapabilities = useRuntimeCapabilities();

  const [adding, setAdding] = useState<AddModulePreset | null>(null);
  const [acting, setActing] = useState(false);
  const { tab, setTab } = useMarketTab();
  const { installedDetailOpen, discoverDetailOpen, setInstalledDetailOpen, setDiscoverDetailOpen, installedPanel, discoverPanel, trackInstalledScroll, trackDiscoverScroll } = useMarketPanelScroll();
  const openAddModule = useCallback((): void => setAdding({ spec: '' }), []);

  const updates = useMemo(() => marketUpdatesOf(modules), [modules]);
  const installed = modules === null ? undefined : withClientRefusals(modules, units.refusals());

  const { reload, recheck, checkPart } = useMarketReload({
    checkedAt: moduleVersionsCheckedAt(versions),
    forceProbe,
    reloadCapability,
    reloadVersions,
  });

  const held = install.applied;

  const freshness: MarketFreshness = {
    loaded: capabilities !== null,
    checking: checking || versionsChecking,
    checkedAt,
  };
  const busy = !marketSettled(freshness, installedRead) || acting;
  const detailOpen = tab === 'installed' ? installedDetailOpen : discoverDetailOpen;
  return (
    <div className={styles.marketPage} data-detail={detailOpen ? 'true' : 'false'}>
      {detailOpen ? null : (
        <MarketHeader
          t={t}
          idPrefix={MARKET_PANEL_ID}
          tab={tab}
          busy={busy}
          checking={checking || versionsAllChecking}
          onTab={setTab}
          onReload={recheck}
          onAdd={openAddModule}
        />
      )}
      <div
        id={`${MARKET_PANEL_ID}-panel-installed`}
        ref={installedPanel}
        role="tabpanel"
        className={styles.marketPanel}
        hidden={tab !== 'installed'}
        onScroll={trackInstalledScroll}
      >
        <MarketView
          t={t}
          titleOf={titleOf}
          manifests={manifests}
          installable={installable}
          capabilities={capabilities}
          runtimePluginMarket={pluginMarketOf(runtimeCapabilities)}
          freshness={freshness}
          onChanged={reload}
          onPending={setActing}
          updates={updates}
          modulesCheck={modulesCheck}
          pluginsCheck={pluginsCheck}
          marketProblem={marketProblem !== null}
          onCheck={checkPart}
          installed={installed}
          unreadable={unreadable}
          readFailure={readFailure}
          readStale={versionsStale}
          installedRead={installedRead}
          workbench={workbench}
          selfUpdate={selfUpdate}
          plugins={plugins}
          settling={held}
          installing={install.installing}
          defaults={machineBoard?.defaults ?? []}
          changed={machineBoard?.changed ?? {}}
          onDetailChange={setInstalledDetailOpen}
        />
        <AddModuleDialog
          t={t}
          open={adding !== null}
          {...(adding === null || adding.spec === '' ? {} : { preset: adding })}
          onClose={() => setAdding(null)}
          onInstalled={() => reload({ force: true })}
        />
      </div>
      <div
        id={`${MARKET_PANEL_ID}-panel-discover`}
        ref={discoverPanel}
        role="tabpanel"
        className={styles.marketPanel}
        hidden={tab !== 'discover'}
        onScroll={trackDiscoverScroll}
      >
        <DiscoverPanel
          t={t}
          active={tab === 'discover'}
          onShowInstalled={() => setTab('installed')}
          onAddModule={setAdding}
          onDetailChange={setDiscoverDetailOpen}
        />
      </div>
    </div>
  );
}

export function registerMarketPanel(ctx: DshClientContext, units: ClientUnitRegistry): void {
  const t = ctx.locale.bind(LOCALE_NS);
  const titleOf: TitleResolve = (title) =>
    title === undefined ? '' : (ctx.locale.resolveText?.({ zh: title.zh, en: title.en }) ?? title.zh);

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: MARKET_PANEL_ID,
        order: 30,
        locale: LOCALE_NS,
        label: () => t('panels.tab.market'),
      },
      makeMarketEntryIcon(units),
    ),
  );

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: MARKET_PANEL_ID, locale: LOCALE_NS, inject: () => ({ units, titleOf }) },
      MarketPanel,
    ),
  );
}
