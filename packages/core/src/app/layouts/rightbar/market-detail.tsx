import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { IconChevronDownOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketFailure, MarketRow, MarketRowAction, MarketState } from './market-row-types';
import { MARKET_STATE_KEY, marketRowTitle } from './market-rows';
import { marketRowKind, packageIcon } from './market-row-icon';
import type { Pending } from './market-view-text';
import { MarketRowControls, MarketRowFailure } from './market-section';
import { marketDetailFacts } from './market-detail-facts';
import styles from '../market/MarketPage.module.css';

const STATE_TONE: Readonly<Record<MarketState, 'neutral' | 'success' | 'warning' | 'danger'>> = {
  checking: 'neutral',
  installed: 'success',
  inactive: 'warning',
  unusable: 'danger',
  broken: 'danger',
  outdated: 'warning',
  'pending-restart': 'warning',
  'pending-followup': 'warning',
  missing: 'neutral',
  unchecked: 'neutral',
  unknown: 'neutral',
};

export interface MarketDetailProps {
  readonly t: Translate;
  readonly row: MarketRow;
  readonly pending: Pending | null;
  readonly failure: MarketFailure | null;
  readonly notice: string | null;
  readonly boardBusy?: boolean | undefined;
  readonly onBack: () => void;
  readonly onRequest: (action: MarketRowAction) => void;
  readonly onDefault?: ((next: boolean) => void) | undefined;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}

export function MarketDetail({
  t,
  row,
  pending,
  failure,
  notice,
  boardBusy,
  onBack,
  onRequest,
  onDefault,
  onRecheck,
  rechecking,
}: MarketDetailProps) {
  const title = marketRowTitle(row, t);
  const facts = marketDetailFacts(row, t);
  const version = row.version?.installed;
  const noteText = row.note === undefined ? null : t(row.note.key, row.note.params);
  return (
    <div className={styles.discoverDetail} data-market-detail={row.id}>
      <button type="button" className={styles.discoverCrumb} onClick={onBack}>
        <IconChevronDownOutlineRegular className={styles.discoverCrumbIcon} aria-hidden="true" />
        <span>{t('panels.market.detailBack')}</span>
      </button>
      <div className={`${styles.discoverDetailHead} ${styles.marketDetailHead}`}>
        <span className={styles.discoverArtwork} aria-hidden="true">
          {packageIcon(marketRowKind(row))}
        </span>
        <div className={styles.discoverMain}>
          <div className={styles.discoverTitleRow}>
            <h3 className={styles.discoverDetailTitle}>{title}</h3>
            {version === undefined ? null : <Tag tone="neutral">{version}</Tag>}
            {row.state === 'installed' ? null : (
              <Tag tone={STATE_TONE[row.state]}>{t(MARKET_STATE_KEY[row.state])}</Tag>
            )}
            {row.local === true ? <Tag tone="neutral">{t('panels.market.localMark')}</Tag> : null}
          </div>
          {row.pkg === undefined ? null : (
            <p className={styles.marketDetailName}>
              <code>{row.pkg}</code>
            </p>
          )}
        </div>
        <div className={styles.marketDetailEnd}>
          <MarketRowControls
            t={t}
            row={row}
            pending={pending}
            boardBusy={boardBusy}
            onRequest={onRequest}
            onDefault={onDefault}
          />
        </div>
      </div>
      {notice === null ? null : <p className={styles.discoverDetailText}>{notice}</p>}
      <MarketRowFailure t={t} failure={failure} onRecheck={onRecheck} rechecking={rechecking} />
      {row.hint === undefined ? null : <p className={styles.discoverMuted}>{t(row.hint)}</p>}
      {noteText === null ? null : (
        <p className={row.note?.tone === 'alert' ? styles.discoverError : styles.discoverMuted}>
          {noteText}
        </p>
      )}
      {facts.length === 0 ? null : (
        <section className={styles.discoverSection}>
          <h4 className={styles.discoverSectionTitle}>{t('panels.market.detailSourceTitle')}</h4>
          <div className={styles.discoverFacts}>
            {facts.map((fact) => (
              <div key={`${fact.labelKey}:${fact.value}`} className={styles.discoverFactRow}>
                <span className={styles.discoverFactKind}>{t(fact.labelKey)}</span>
                <span className={styles.discoverFactValue}>
                  {fact.code === true ? (
                    <code className={styles.discoverCode}>{fact.value}</code>
                  ) : (
                    fact.value
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
