import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Tip } from '@/shared/components/Tip';
import type { DshClientContext } from '@dsh-workbench/shared';
import type { ClientUnitRegistry } from '@/app/units/registry';
import type { Translate } from '@dsh-workbench/shared';
import type { UnitManifest } from '@dsh-workbench/shared';
import { IconModules } from '@/shared/components/IconModules';
import { Button, IconPlusOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { bumpCapabilityEpoch, markNextProbeSilent } from '@/shared/hooks/use-capabilities';
import { useCapabilityMap } from '@/shared/hooks/use-capability-gate';
import { devSurface } from '@/dev/surface';
import type { MarketMock } from '../rightbar/market-mock';

import { LOCALE_NS } from '@dsh-workbench/shared';
import { publishPanelHint } from '../panel-hint';
import {
  MARKET_STALE_MS,
  marketSettled,
  shouldProbeOnEnter,
  type MarketFreshness,
} from '../rightbar/market-freshness';
import { MODULE_SETTLE_MS, holdBack } from '../rightbar/market-settle';
import { marketUpdatesOf, withClientRefusals } from '../rightbar/market-rows';
import { marketHintOf } from '../rightbar/market-hint';
import { useMarketBusy } from '../rightbar/market-busy';
import { MarketView } from '../rightbar/MarketView';
import { useEnabledUnits } from '../rightbar/use-panels';
import { bumpModuleVersionsEpoch, useModuleVersions } from './use-module-versions';
import { AddModuleDialog } from './AddModuleDialog';
import styles from './MarketPage.module.css';

export const MARKET_PANEL_ID = 'workbench-market';

const MOCK_FRESHNESS: MarketFreshness = { loaded: true, checking: false, checkedAt: null };
const NO_UNITS: ReadonlySet<string> = new Set();

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
    const { modules, plugins, workbench } = useModuleVersions();
    const installed = modules === null ? undefined : withClientRefusals(modules, units.refusals());
    const busy = useMarketBusy();
    const hint = marketHintOf({
      manifests,
      installable,
      capabilities,
      modules,
      installed,
      plugins,
      workbench,
      busy,
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

function MarketPanel({ t, units }: { t: Translate; units: ClientUnitRegistry }) {
  const manifests = useLiveManifests(units);
  const installable = useInstallableUnits(units);
  const { capabilities, checkedAt, checking, forceProbe, reload: reloadCapability } = useCapabilityMap(0);
  const { modules, plugins, workbench, selfUpdate, read: installedRead, reload: reloadVersions } = useModuleVersions();
  const machineBoard = useEnabledUnits(0, null);

  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState(false);
  const openAddModule = useCallback((): void => setAdding(true), []);

  const updates = useMemo(() => marketUpdatesOf(modules), [modules]);
  const installed = modules === null ? undefined : withClientRefusals(modules, units.refusals());

  const reload = useCallback(
    (options?: { readonly force?: boolean }): void => {
      if (options?.force === true) {
        bumpModuleVersionsEpoch();
        bumpCapabilityEpoch();
        forceProbe();
        reloadVersions({ force: true, fresh: true });
        return;
      }
      reloadCapability();
      reloadVersions();
    },
    [reloadCapability, reloadVersions, forceProbe],
  );

  const enteredRef = useRef(false);

  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    reloadVersions();
    if (!shouldProbeOnEnter({ checkedAt, now: Date.now(), staleMs: MARKET_STALE_MS })) return;
    markNextProbeSilent();
    forceProbe();
  }, [checkedAt, forceProbe, reloadVersions]);

  const installedKey = (installed ?? []).map((module) => module.unit).join('|');
  const rosterKey = manifests.map((manifest) => manifest.id).join('|');
  const activeKey = Object.keys(capabilities ?? {}).join('|');
  const seenRef = useRef<ReadonlySet<string> | null>(null);
  const [settling, setSettling] = useState<ReadonlySet<string>>(NO_UNITS);

  useEffect(() => {
    const units = installedKey === '' ? [] : installedKey.split('|');
    const roster = new Set(rosterKey === '' ? [] : rosterKey.split('|'));
    const active = new Set(activeKey === '' ? [] : activeKey.split('|'));
    const held = holdBack(units, roster, active, seenRef.current);
    seenRef.current = new Set(units);
    setSettling(held.length === 0 ? NO_UNITS : new Set(held));
    if (held.length === 0) return;
    const timer = setTimeout(() => setSettling(NO_UNITS), MODULE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [installedKey, rosterKey, activeKey]);

  const freshness: MarketFreshness = { loaded: capabilities !== null, checking, checkedAt };
  const pendingFreshness: MarketFreshness = { loaded: false, checking: true, checkedAt: null };

  const devMarket = devSurface.useStrips<MarketMock>('market', manifests);
  const mock = devMarket.current;
  const mockNonce = devMarket.pick.nonce;

  const shownFreshness =
    mock === undefined ? freshness : mock.loaded === false ? pendingFreshness : MOCK_FRESHNESS;
  const shownRead = mock === undefined ? installedRead : (mock.installedRead ?? true);
  const busy = !marketSettled(shownFreshness, shownRead) || shownFreshness.checking || acting;

  return (
    <div className={styles.marketPage}>
      <header className={styles.marketPageHead}>
        <div>
          <h1 className={styles.marketPageTitle}>{t('panels.tab.market')}</h1>
          <p className={styles.marketPageIntro}>{t('panels.market.lead')}</p>
        </div>
        <div className={styles.marketPageTools}>
          <Tip label={t('panels.market.recheck')}>
          <button
            type="button"
            className={`${styles.marketIconButton}${shownFreshness.checking ? ` ${styles.marketIconButtonSpinning}` : ''}`}
            aria-label={t('panels.market.checkUpdates')}
            disabled={busy}
            onClick={() => reload({ force: true })}
          >
            <span className={styles.marketIconWrap} aria-hidden="true">
              <IconRefreshOutlineRegular />
            </span>
          </button>
          </Tip>
          <Button
            variant="primary"
            size="sm"
            className={styles.marketAddButton}
            icon={<IconPlusOutlineRegular size={13} />}
            disabled={busy}
            onClick={openAddModule}
          >
            {t('panels.market.add.open')}
          </Button>
        </div>
      </header>
      {devMarket.strip}
      <MarketView
        key={`${mock?.id ?? 'real-market'}-${mockNonce}`}
        t={t}
        manifests={manifests}
        installable={installable}
        capabilities={capabilities}
        freshness={shownFreshness}
        onChanged={reload}
        onPending={setActing}
        updates={updates}
        installed={installed}
        installedRead={shownRead}
        workbench={workbench}
        selfUpdate={selfUpdate}
        plugins={plugins}
        settling={mock === undefined ? settling : undefined}
        mock={mock}
        defaults={machineBoard?.defaults ?? []}
        changed={machineBoard?.changed ?? {}}
      />
      <AddModuleDialog
        t={t}
        open={adding}
        onClose={() => setAdding(false)}
        onInstalled={() => reload({ force: true })}
      />
    </div>
  );
}

export function registerMarketPanel(ctx: DshClientContext, units: ClientUnitRegistry): void {
  const t = ctx.locale.bind(LOCALE_NS);

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
      { name: 'main', key: MARKET_PANEL_ID, locale: LOCALE_NS, inject: () => ({ units }) },
      MarketPanel,
    ),
  );
}
