import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketFailure, MarketRowAction } from './market-row-types';
import { SHARED_STATE_KEY, sharedActions, type SharedRow, type SharedState } from './market-rows';
import { packageIcon, sharedRowKind } from './market-row-icon';
import { MarketRowFailure } from './market-section';
import { MarketDetailTop } from './market-detail-top';
import { SharedActions } from './SharedSection';
import { sharedDetailFacts } from './market-detail-facts';
import type { Pending } from './market-view-text';
import styles from '../market/MarketPage.module.css';

const STATE_TONE: Readonly<Record<SharedState, 'neutral' | 'success' | 'warning' | 'danger'>> = {
  checking: 'neutral',
  installed: 'success',
  outdated: 'warning',
  unsatisfied: 'warning',
  missing: 'danger',
  unchecked: 'neutral',
};

export interface SharedDetailProps {
  readonly t: Translate;
  readonly row: SharedRow;
  readonly pending: Pending | null;
  readonly failure: MarketFailure | null;
  readonly onBack: () => void;
  readonly onAct: (action: MarketRowAction) => void;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
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
}: SharedDetailProps) {
  const running = pending !== null && pending.id === row.id ? pending : null;
  const locked = pending !== null;
  const actions = sharedActions(row);
  const version = row.version?.installed ?? row.version?.latest;
  const facts = sharedDetailFacts(row, t);
  return (
    <div className={styles.discoverDetail} data-market-detail={row.id}>
      <MarketDetailTop
        t={t}
        onBack={onBack}
        icon={packageIcon(sharedRowKind(row))}
        end={
          <div className={styles.marketDetailEnd}>
            <SharedActions t={t} actions={actions} running={running} locked={locked} onAct={onAct} />
          </div>
        }
      >
        <div className={styles.discoverMain}>
          <div className={styles.discoverTitleRow}>
            <h3 className={styles.discoverDetailTitle}>{row.label}</h3>
            {version === undefined ? null : <Tag tone="neutral">{version}</Tag>}
            {row.state === 'installed' ? null : (
              <Tag tone={STATE_TONE[row.state]}>{t(SHARED_STATE_KEY[row.state])}</Tag>
            )}
          </div>
        </div>
      </MarketDetailTop>
      <MarketRowFailure t={t} failure={failure} onRecheck={onRecheck} rechecking={rechecking} />
      <section className={styles.discoverSection}>
        <h4 className={styles.discoverSectionTitle}>{t('panels.market.detailSharedTitle')}</h4>
        <div className={styles.discoverFacts}>
          {facts.map((fact) => (
            <div key={`${fact.labelKey}:${fact.value}`} className={styles.discoverFactRow}>
              <span className={styles.discoverFactKind}>{t(fact.labelKey)}</span>
              <span className={styles.discoverFactValue}>{fact.value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
