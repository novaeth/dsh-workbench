import { Fragment, createElement as h, useState } from 'react';
import type { ReactNode, Translate } from '@dsh-workbench/shared';
import { Spinner } from '@dsh-workbench/shared';
import { Tip } from '@/shared/components/Tip';
import {
  Button,
  IconTrashOutlineRegular,
  RiskConfirmation,
  StateDot,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketFailure, MarketRow, MarketRowAction } from './market-row-types';
import {
  MARKET_DOT,
  MARKET_STATE_KEY,
  marketActions,
  marketRowTitle,
  marketSwitchLocked,
} from './market-rows';
import { ACTION_LABEL_KEY, PROGRESS_KEY, UPDATE_ACTIONS, type Pending } from './market-view-text';
import { packageIcon, marketRowKind } from './market-row-icon';
import type { MarketSectionIcon } from './market-section-icon';
import { FailureCard } from './FailureCard';
import { failureCardOf } from './failure-card-text';
import styles from '../market/MarketPage.module.css';

const CONFIRM_DANGER: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];

function MigrationConfirm({
  t,
  onConfirm,
  onCancel,
}: {
  readonly t: Translate;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <RiskConfirmation
      open
      title={t('panels.market.migrateConfirmTitle')}
      description={t('panels.market.migrateConfirmDetail')}
      acknowledgeLabel={t('panels.market.migrateConfirmAck')}
      cancelLabel={t('panels.market.confirmNo')}
      closeLabel={t('panels.market.confirmNo')}
      confirmLabel={t('panels.market.migrateConfirmYes')}
      acknowledged={acknowledged}
      onAcknowledgedChange={setAcknowledged}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function DismissFollowUpConfirm({
  t,
  onConfirm,
  onCancel,
}: {
  readonly t: Translate;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <RiskConfirmation
      open
      title={t('panels.market.dismissFollowUpTitle')}
      description={t('panels.market.dismissFollowUpDetail')}
      acknowledgeLabel={t('panels.market.dismissFollowUpAck')}
      cancelLabel={t('panels.market.confirmNo')}
      closeLabel={t('panels.market.confirmNo')}
      confirmLabel={t('panels.market.dismissFollowUpYes')}
      acknowledged={acknowledged}
      onAcknowledgedChange={setAcknowledged}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function MarketLineStatus({
  t,
  row,
  quiet,
}: {
  readonly t: Translate;
  readonly row: MarketRow;
  readonly quiet: boolean;
}) {
  const stateText = t(MARKET_STATE_KEY[row.state]);
  const noteText = row.note === undefined ? null : t(row.note.key, row.note.params);
  if (quiet) return null;
  return (
    <span className={styles.marketStatus}>
      {row.state === 'checking' ? (
        <Spinner size={14} />
      ) : (
        <StateDot state={MARKET_DOT[row.state]} size={9} />
      )}
      <span className={styles.marketStateText}>{stateText}</span>
      {row.hint === undefined ? null : (
        <>
          <span className={styles.marketSep} aria-hidden="true">·</span>
          <span className={styles.marketReason}>{t(row.hint)}</span>
        </>
      )}
      {noteText === null ? null : (
        <>
          <span className={styles.marketSep} aria-hidden="true">·</span>
          <span className={styles.marketReason}>{noteText}</span>
        </>
      )}
    </span>
  );
}

export function MarketRowFailure({
  t,
  failure,
  onRecheck,
  rechecking,
}: {
  readonly t: Translate;
  readonly failure: MarketFailure | null;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  if (failure === null) return null;
  const model =
    failure.card ?? (failure.failure === undefined ? undefined : failureCardOf(failure.failure, t));
  if (model !== undefined) {
    return (
      <div className={styles.marketFailureSeat}>
        <FailureCard t={t} model={model} onRecheck={onRecheck} rechecking={rechecking} />
      </div>
    );
  }
  return <div className={styles.marketFailure}>{failure.message}</div>;
}

export function MarketRowControls({
  t,
  row,
  pending,
  boardBusy,
  onRequest,
  onDefault,
}: {
  readonly t: Translate;
  readonly row: MarketRow;
  readonly pending: Pending | null;
  readonly boardBusy?: boolean | undefined;
  readonly onRequest: (action: MarketRowAction) => void;
  readonly onDefault?: ((next: boolean) => void) | undefined;
}) {
  const running = pending !== null && pending.id === row.id ? pending : null;
  const locked = pending !== null;
  const actions = marketActions(row);
  const switchLocked = marketSwitchLocked(row);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  return (
    <>
      {running !== null ? (
        <span className={styles.marketProgress}>
          <Spinner size={14} />
          {t(PROGRESS_KEY[running.action])}
        </span>
      ) : actions.length === 0 ? null : (
        <span className={styles.marketActions}>
          {actions.map((action) => {
            const danger = CONFIRM_DANGER.includes(action);
            const update = UPDATE_ACTIONS.includes(action);
            return (
              <Button
                key={action}
                type="button"
                size="sm"
                variant={action === 'install' || action === 'migrate-workbench' ? 'primary' : 'outline'}
                className={danger ? 'wb-dangerAction' : update ? styles.marketUpdateAction : undefined}
                icon={danger ? <IconTrashOutlineRegular size={13} /> : undefined}
                aria-label={
                  danger ? t('panels.market.uninstallLabel', { name: marketRowTitle(row, t) }) : undefined
                }
                disabled={locked}
                onClick={() => {
                  if (action === 'migrate-workbench') setMigrationOpen(true);
                  else if (action === 'dismiss-followup') setDismissOpen(true);
                  else onRequest(action);
                }}
              >
                {t(ACTION_LABEL_KEY[action])}
              </Button>
            );
          })}
        </span>
      )}
      {row.defaultShown === undefined ? null : (
        <Tip
          label={t(switchLocked ? 'panels.market.defaultLocked' : 'panels.market.defaultHint')}
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
      {migrationOpen ? (
        <MigrationConfirm
          t={t}
          onCancel={() => setMigrationOpen(false)}
          onConfirm={() => {
            setMigrationOpen(false);
            onRequest('migrate-workbench');
          }}
        />
      ) : null}
      {dismissOpen ? (
        <DismissFollowUpConfirm
          t={t}
          onCancel={() => setDismissOpen(false)}
          onConfirm={() => {
            setDismissOpen(false);
            onRequest('dismiss-followup');
          }}
        />
      ) : null}
    </>
  );
}

function MarketLine({
  t,
  row,
  pending,
  failure,
  onAct,
  onDefault,
  onOpenDetail,
  boardBusy,
  onRecheck,
  rechecking,
}: {
  t: Translate;
  row: MarketRow;
  pending: Pending | null;
  failure: MarketFailure | null;
  onAct: (action: MarketRowAction) => void;
  onDefault?: ((next: boolean) => void) | undefined;
  onOpenDetail?: ((id: string) => void) | undefined;
  boardBusy?: boolean | undefined;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const title = marketRowTitle(row, t);
  const quiet = row.workbench === true && row.state === 'installed' && row.hint === undefined;
  const clickable = row.pkg !== undefined && onOpenDetail !== undefined;
  return (
    <li className={styles.marketRow} data-open={clickable ? 'true' : undefined}>
      <span className={styles.marketIcon} aria-hidden="true">
        {packageIcon(marketRowKind(row))}
      </span>

      <div className={styles.marketMain}>
        <span className={styles.marketName}>
          {clickable ? (
            <button
              type="button"
              className={styles.marketNameOpen}
              aria-label={t('panels.market.openDetail', { name: title })}
              onClick={() => onOpenDetail?.(row.id)}
            >
              {title}
            </button>
          ) : (
            title
          )}
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
            <span className={styles.marketLocalTag}>{t('panels.market.localMark')}</span>
          ) : null}
        </span>
        <MarketLineStatus t={t} row={row} quiet={quiet} />
      </div>

      <div className={styles.marketEnd}>
        <MarketRowControls
          t={t}
          row={row}
          pending={pending}
          boardBusy={boardBusy}
          onDefault={(next) => onDefault?.(next)}
          onRequest={(action) => onAct(action)}
        />
      </div>

      <MarketRowFailure t={t} failure={failure} onRecheck={onRecheck} rechecking={rechecking} />
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
  onOpenDetail,
  boardBusy,
  headAction,
  keepHead,
  onRecheck,
  rechecking,
}: {
  readonly t: Translate;
  readonly titleKey?: string;
  readonly icon?: MarketSectionIcon;
  readonly rows: readonly MarketRow[];
  readonly pending: Pending | null;
  readonly failureOf: (id: string) => MarketFailure | null;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onDefault?: ((id: string, next: boolean) => void) | undefined;
  readonly onOpenDetail?: ((id: string) => void) | undefined;
  readonly boardBusy?: boolean | undefined;
  readonly confirmActions: readonly MarketRowAction[];
  readonly onConfirming: (id: string | null) => void;
  readonly headAction?: ReactNode;
  readonly keepHead?: boolean;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  if (rows.length === 0 && keepHead !== true) return null;
  const request = (id: string, action: MarketRowAction): void => {
    if (confirmActions.includes(action)) onConfirming(id);
    else void act(id, action);
  };
  return (
    <section className={styles.marketSection}>
      {titleKey === undefined ? null : (
        <div className={styles.marketSectionHead}>
          <span className={styles.marketSectionIcon} aria-hidden="true">
            {icon}
          </span>
          <h2 className={styles.marketSectionTitle}>{t(titleKey)}</h2>
          <span className={styles.marketSectionCount}>{rows.length}</span>
          {headAction === undefined ? null : (
            <span className={styles.marketSectionAction}>{headAction}</span>
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
              onAct={(action) => request(row.id, action)}
              onDefault={(next) => onDefault?.(row.id, next)}
              onOpenDetail={onOpenDetail}
              boardBusy={boardBusy}
              onRecheck={onRecheck}
              rechecking={rechecking}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
