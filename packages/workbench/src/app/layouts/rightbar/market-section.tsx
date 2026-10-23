import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Spinner } from '@dsh-workbench/shared';

import { Tip } from '@/shared/components/Tip';
import {
  Button,
  IconTrashOutlineRegular,
  StateDot,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketRow } from './market-row-types';
import {
  MARKET_DOT,
  MARKET_STATE_KEY,
  marketActions,
  marketRowTitle,
  marketSwitchLocked,
  type MarketRowAction,
} from './market-rows';
import { marketRowKind, packageIcon } from './market-row-icon';
import type { MarketSectionIcon } from './market-section-icon';
import { ACTION_LABEL_KEY, PROGRESS_KEY, type Pending } from './market-view-text';
import styles from '../market/MarketPage.module.css';

const dangerActions: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];

const updateActions: readonly MarketRowAction[] = [
  'update',
  'update-bundle',
  'update-plugin',
  'update-workbench',
];

function MarketLine({
  t,
  row,
  pending,
  failure,
  onAct,
  onDefault,
  boardBusy,
}: {
  t: Translate;
  row: MarketRow;
  pending: Pending | null;
  failure: string | null;
  onAct: (action: MarketRowAction) => void;
  onDefault?: ((next: boolean) => void) | undefined;
  boardBusy?: boolean | undefined;
}) {
  const running = pending !== null && pending.id === row.id ? pending : null;
  const locked = pending !== null;
  const quiet =
    row.workbench === true && row.state === 'installed' && row.hint === undefined;
  const actions = marketActions(row);
  const switchLocked = marketSwitchLocked(row);
  const stateText = t(MARKET_STATE_KEY[row.state]);

  return (
    <li className={styles.marketRow}>
      <span className={styles.marketIcon} aria-hidden="true">
        {packageIcon(marketRowKind(row))}
      </span>

      <div className={styles.marketMain}>
        <span className={styles.marketName}>
          {marketRowTitle(row, t)}
          {row.versionLabel === undefined ? null : (
            <span className={styles.marketVersion}>{row.versionLabel}</span>
          )}
          {row.version === undefined || row.versionLabel !== undefined ? null : (
            <span className={styles.marketVersion}>
              {row.version.installed !== undefined &&
              row.version.latest !== undefined &&
              row.version.installed !== row.version.latest
                ? t('panels.market.versionArrow', {
                    from: row.version.installed,
                    to: row.version.latest,
                  })
                : (row.version.installed ?? row.version.latest ?? '')}
            </span>
          )}
          {row.local === true ? (
            <Tip label={t('panels.market.localHint')}>
              <span className={styles.marketLocalTag}>{t('panels.market.localMark')}</span>
            </Tip>
          ) : null}
        </span>
        {quiet ? null : (
        <span className={styles.marketDesc} role="img" aria-label={stateText}>
          {row.state === 'checking' ? (
            <Spinner size={14} />
          ) : (
            <StateDot state={MARKET_DOT[row.state]} size={9} />
          )}
          {stateText}
          {row.hint === undefined ? null : (
            <span className={styles.marketUsedBy}>{t(row.hint)}</span>
          )}
        </span>
        )}
      </div>

      <div className={styles.marketEnd}>
        {running !== null ? (
          <span className={styles.marketProgress}>
            <Spinner size={14} />
            {t(PROGRESS_KEY[running.action])}
          </span>
        ) : actions.length === 0 ? null : (
          <span className={styles.marketActions}>
            {actions.map((action) => {
              const danger = dangerActions.includes(action);
              const update = updateActions.includes(action);
              return (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  variant={action === 'install' ? 'primary' : 'outline'}
                  className={danger ? 'wb-dangerAction' : update ? styles.marketUpdateAction : undefined}
                  icon={danger ? <IconTrashOutlineRegular size={13} /> : undefined}
                  aria-label={
                    danger
                      ? t('panels.market.uninstallLabel', { name: marketRowTitle(row, t) })
                      : undefined
                  }
                  disabled={locked}
                  onClick={() => onAct(action)}
                >
                  {t(ACTION_LABEL_KEY[action])}
                </Button>
              );
            })}
          </span>
        )}
        {row.defaultShown === undefined ? null : (
          <Tip
            label={t(
              switchLocked ? 'panels.market.defaultLocked' : 'panels.market.defaultHint',
            )}
          >
            <span className={styles.marketSwitchSeat}>
              <Switch
                checked={row.defaultShown}
                disabled={boardBusy === true || locked || switchLocked}
                label={`${marketRowTitle(row, t)} · ${t('panels.market.defaultLabel')}`}
                onChange={(next) => onDefault?.(next)}
              />
            </span>
          </Tip>
        )}
      </div>

      {row.note === undefined ? null : (
        <div
          className={row.note.tone === 'plain' ? styles.marketNotePlain : styles.marketNote}
          title={
            row.note.params.reason === undefined
              ? undefined
              : t('panels.market.moduleRefusedDetail', row.note.params)
          }
        >
          {t(row.note.key, row.note.params)}
        </div>
      )}
      {failure === null ? null : <div className={styles.marketFailure}>{failure}</div>}
    </li>
  );
}

export function MarketSection({
  t,
  titleKey,
  icon,
  rows,
  pending,
  failureOf,
  act,
  confirmActions,
  onConfirming,
  onDefault,
  boardBusy,
}: {
  readonly t: Translate;
  readonly titleKey?: string;
  readonly icon?: MarketSectionIcon;
  readonly rows: readonly MarketRow[];
  readonly pending: Pending | null;
  readonly failureOf: (id: string) => string | null;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onDefault?: ((id: string, next: boolean) => void) | undefined;
  readonly boardBusy?: boolean | undefined;
  readonly confirmActions: readonly MarketRowAction[];
  readonly onConfirming: (id: string | null) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className={styles.marketSection}>
      {titleKey === undefined ? null : (
        <div className={styles.marketSectionHead}>
          <span className={styles.marketSectionIcon} aria-hidden="true">
            {icon}
          </span>
          <h2 className={styles.marketSectionTitle}>{t(titleKey)}</h2>
          {rows.length === 0 ? null : (
            <span className={styles.marketSectionCount}>{rows.length}</span>
          )}
        </div>
      )}
      {rows.length === 0 ? null : (
        <ul className={styles.marketList}>
          {rows.map((row) => (
            <MarketLine
              key={row.id}
              t={t}
              row={row}
              pending={pending}
              failure={failureOf(row.id)}
              onAct={(action) =>
                confirmActions.includes(action) ? onConfirming(row.id) : void act(row.id, action)
              }
              onDefault={(next) => onDefault?.(row.id, next)}
              boardBusy={boardBusy}
            />
          ))}
        </ul>
      )}

    </section>
  );
}
