import { Fragment, createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketFailure, MarketRowAction } from './market-row-types';
import { SHARED_STATE_KEY, sharedActions, type SharedRow, type SharedState } from './market-rows';
import { packageIcon, sharedRowKind } from './market-row-icon';
import { MarketRowFailure } from './market-section';
import { SharedActions } from './SharedSection';
import { sharedDetailFacts } from './market-detail-facts';
import type { Pending } from './market-view-text';
import { detailFacts } from '../market/detail-facts';
import {
  installedDescription,
  installedDetailPanel,
  installedDetailTabs,
  installedDetailTop,
} from './installed-detail-parts';
import type { InstalledDetailRecheckProps, InstalledDetailTabProps } from './installed-detail-types';
import type { DetailTab } from '../market/detail-tabs';
import { useInstalledInfo } from '../market/use-installed-info';
import styles from '../market/MarketPage.module.css';

const STATE_TONE: Readonly<Record<SharedState, 'neutral' | 'success' | 'warning' | 'danger'>> = {
  checking: 'neutral',
  installed: 'success',
  outdated: 'warning',
  unsatisfied: 'warning',
  missing: 'danger',
  unchecked: 'neutral',
};

export interface SharedDetailProps extends InstalledDetailTabProps, InstalledDetailRecheckProps {
  readonly t: Translate;
  readonly row: SharedRow;
  readonly pending: Pending | null;
  readonly failure: MarketFailure | null;
  readonly onBack: () => void;
  readonly onAct: (action: MarketRowAction) => void;
}

export function sharedPackageOf(row: SharedRow): string | undefined {
  const text = row.source?.kind === 'npm' ? row.source.text : row.label;
  return text.trim() === '' ? undefined : text.trim();
}

export function SharedDetail({
  t,
  row,
  pending,
  failure,
  onBack,
  onAct,
  onRecheck,
  rechecking,
  tab,
  onTab,
  info,
}: SharedDetailProps) {
  const activeTab = tab ?? 'overview';
  const running = pending !== null && pending.id === row.id ? pending : null;
  const locked = pending !== null;
  const actions = sharedActions(row);
  const version = row.version?.installed ?? row.version?.latest;
  const pkg = sharedPackageOf(row);
  const facts = sharedDetailFacts(row, t, info);
  const idPrefix = `shared-detail-${row.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return (
    <div className={styles.discoverDetail} data-market-detail={row.id}>
      {installedDetailTop({
        t,
        onBack,
        icon: packageIcon(sharedRowKind(row)),
        tabs: installedDetailTabs({
          t,
          idPrefix,
          value: activeTab,
          onChange: (next) => onTab?.(next),
          labelKey: 'panels.market.detailSharedTabs',
        }),
        end: (
          <div className={styles.marketDetailEnd}>
            <SharedActions t={t} actions={actions} running={running} locked={locked} onAct={onAct} />
          </div>
        ),
        children: (
          <div className={styles.discoverMain}>
            <div className={styles.discoverTitleRow}>
              <h3 className={styles.discoverDetailTitle}>{row.label}</h3>
              {version === undefined ? null : <Tag tone="neutral">{version}</Tag>}
              {row.state === 'installed' ? null : (
                <Tag tone={STATE_TONE[row.state]}>{t(SHARED_STATE_KEY[row.state])}</Tag>
              )}
            </div>
          </div>
        ),
      })}
      {installedDetailPanel({
        t,
        idPrefix,
        tab: activeTab,
        pkg,
        version,
        children: (
          <Fragment>
            {installedDescription(info)}
            <MarketRowFailure t={t} failure={failure} onRecheck={onRecheck} rechecking={rechecking} />
            <section className={styles.discoverSection}>
              <h4 className={styles.discoverSectionTitle}>{t('panels.market.detailSharedTitle')}</h4>
              {detailFacts({ t, facts })}
            </section>
          </Fragment>
        ),
      })}
    </div>
  );
}

export type SharedDetailPageProps = Omit<SharedDetailProps, 'tab' | 'onTab' | 'info'>;

export function SharedDetailPage(props: SharedDetailPageProps) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const info = useInstalledInfo(sharedPackageOf(props.row));
  return <SharedDetail {...props} tab={tab} onTab={setTab} info={info} />;
}
