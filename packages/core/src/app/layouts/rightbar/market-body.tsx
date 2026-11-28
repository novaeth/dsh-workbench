import { Fragment, createElement as h } from 'react';
import { FailureCard } from './FailureCard';
import { MarketEmpty } from './MarketStates';
import type { MarketFailure, MarketRow, MarketRowAction } from './market-row-types';
import type { MarketBodyExtras, MarketBodyProps } from './market-body-props';
import { marketFootVisible } from './market-view-text';
import { marketRowTitle, updatablePlugins } from './market-rows';
import { marketOrder, marketSections } from './market-sections';
import { MarketSection } from './market-section';
import { MarketUnreadableBadge } from './market-unreadable-badge';
import { listReadCardOf } from './market-problem-card';
import { UpdateAllPlugins } from './UpdateAllPlugins';
import { marketSectionIcon } from './market-section-icon';
import { PanelFoot } from '@/shared/components/PanelFoot';
import styles from '../market/MarketPage.module.css';

const CONFIRM_ACTIONS = ['uninstall', 'remove-bundle', 'uninstall-plugin'] as const satisfies readonly MarketRowAction[];
const NO_ROWS: readonly MarketRow[] = [];

export function MarketBody({
  t,
  self,
  shown,
  pluginList,
  installedList,
  unreadable = [],
  readStale = false,
  pending,
  failed,
  notice,
  readFailure = null,
  act,
  onConfirming,
  setDefault,
  boardBusy,
  checks,
  onRecheck,
  rechecking,
  runtimePluginMarket,
  onOpenDetail,
  onBuildModule,
}: MarketBodyProps & MarketBodyExtras) {
  const failureOf = (id: string): MarketFailure | null => (failed?.id === id ? failed : null);
  const foot = marketFootVisible(shown, installedList);
  const sections = marketSections(
    marketOrder([...shown, ...installedList], (row) => marketRowTitle(row, t)),
  );
  const installed = sections.find((section) => section.id === 'installed');
  const installedRows = installed?.rows ?? NO_ROWS;
  const pendingSection = sections.find((section) => section.id === 'not-installed');
  const listCard = readFailure === null ? undefined : listReadCardOf(t, readFailure);
  const common = {
    t,
    onDefault: setDefault,
    boardBusy,
    pending,
    failureOf,
    act,
    confirmActions: CONFIRM_ACTIONS,
    onConfirming,
    onOpenDetail,
    onRecheck,
    rechecking,
  } as const;
  return (
    <>
      {listCard === undefined ? (
        notice === null ? null : <div className={styles.marketNote}>{notice}</div>
      ) : (
        <div className={styles.marketFailureSeat}>
          <FailureCard t={t} model={listCard} extras={listCard} onRecheck={onRecheck} rechecking={rechecking} />
        </div>
      )}
      {readStale ? <div className={styles.marketNote}>{t('panels.staleNote')}</div> : null}
      <MarketSection {...common} rows={self === undefined ? [] : [self]} />
      {self === undefined ? null : (
        <div className={styles.marketSelfDivider} aria-hidden="true" />
      )}
      <MarketSection
        {...common}
        titleKey="panels.market.sectionInstalled"
        icon={marketSectionIcon('installed')}
        rows={installedRows}
        keepHead
        titleNote={h(MarketUnreadableBadge, { t, rows: unreadable })}
        headAction={checks.modules}
      />
      {installedRows.length === 0 ? (
        <div className={styles.marketEmptyInline}>
          <MarketEmpty t={t} {...(onBuildModule === undefined ? {} : { onBuildModule })} />
        </div>
      ) : null}
      {pendingSection === undefined ? null : (
        <MarketSection
          {...common}
          titleKey={pendingSection.titleKey}
          icon={marketSectionIcon('pending')}
          rows={pendingSection.rows}
        />
      )}
      {runtimePluginMarket === false ? null : (
        <MarketSection
          {...common}
          titleKey="panels.market.sectionPlugins"
          icon={marketSectionIcon('plugins')}
          rows={pluginList}
          headAction={
            <Fragment>
              {checks.plugins}
              {h(UpdateAllPlugins, { t, rows: updatablePlugins(pluginList), act })}
            </Fragment>
          }
        />
      )}

      {foot ? <PanelFoot size="md" text={t('panels.market.foot')} /> : null}
    </>
  );
}

