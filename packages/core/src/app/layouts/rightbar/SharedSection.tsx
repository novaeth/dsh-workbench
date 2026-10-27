import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from '@dsh-workbench/shared';
import { SHARED_STATE_KEY, sharedActions, type SharedRow } from './market-rows';
import { marketSectionIcon } from './market-section-icon';
import { packageIcon, sharedRowKind } from './market-row-icon';
import { ACTION_LABEL_KEY, PROGRESS_KEY, type Pending } from './market-view-text';
import styles from '../market/MarketPage.module.css';
import type { MarketRowAction } from './market-rows';

function SharedLine({
  t,
  row,
  pending,
  failure,
  onAct,
}: {
  t: Translate;
  row: SharedRow;
  pending: Pending | null;
  failure: string | null;
  onAct: (action: MarketRowAction) => void;
}) {
  const running = pending !== null && pending.id === row.id ? pending : null;
  const locked = pending !== null;
  const actions = sharedActions(row);
  const stateText = t(SHARED_STATE_KEY[row.state]);
  const version = row.version;
  const name = (
    <span className={styles.marketName}>
      {row.label}
      {version === undefined ? null : (
        <span className={styles.marketVersion}>
          {version.installed !== undefined &&
          version.latest !== undefined &&
          version.installed !== version.latest
            ? t('panels.market.versionArrow', { from: version.installed, to: version.latest })
            : (version.installed ?? version.latest ?? '')}
        </span>
      )}
    </span>
  );

  return (
    <li className={styles.marketRow}>
      <span className={styles.marketIcon} aria-hidden="true">
        {packageIcon(sharedRowKind(row))}
      </span>

      <div className={styles.marketMain}>
        {name}
        <span className={styles.marketStatus}>
          {row.state === 'checking' ? <Spinner size={14} /> : null}
          <span className={styles.marketStateText}>{stateText}</span>
          <span className={styles.marketSep} aria-hidden="true">·</span>
          <span className={styles.marketReason}>
            {t('panels.market.sharedUsedBy', {
              modules: row.usedByKeys.map((key) => t(key)).join(t('panels.market.listSeparator')),
            })}
          </span>
        </span>
      </div>

      <div className={styles.marketEnd}>
        {running !== null ? (
          <span className={styles.marketProgress}>
            <Spinner size={14} />
            {t(PROGRESS_KEY[running.action])}
          </span>
        ) : actions.length === 0 ? null : (
          <span className={styles.marketActions}>
            {actions.map((action) => (
              <Button
                key={action}
                type="button"
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() => onAct(action)}
              >
                {t(ACTION_LABEL_KEY[action])}
              </Button>
            ))}
          </span>
        )}
      </div>

      {failure === null ? null : <div className={styles.marketFailure}>{failure}</div>}
    </li>
  );
}

export function SharedSection({
  t,
  rows,
  pending,
  failureOf,
  act,
}: {
  readonly t: Translate;
  readonly rows: readonly SharedRow[];
  readonly pending: Pending | null;
  readonly failureOf: (id: string) => string | null;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className={`${styles.marketSection} ${styles.marketSectionQuiet}`}>
      <div className={styles.marketSectionHead}>
        <span className={styles.marketSectionIcon} aria-hidden="true">
          {marketSectionIcon('shared')}
        </span>
        <h2 className={styles.marketSectionTitle}>{t('panels.market.sectionShared')}</h2>
        <span className={styles.marketSectionCount}>{rows.length}</span>
      </div>
      <ul className={styles.marketList}>
        {rows.map((row) => (
          <SharedLine
            key={row.id}
            t={t}
            row={row}
            pending={pending}
            failure={failureOf(row.id)}
            onAct={(action) => void act(row.id, action)}
          />
        ))}
      </ul>
    </section>
  );
}
