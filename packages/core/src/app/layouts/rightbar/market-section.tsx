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
import type { MarketFailure, MarketRow } from './market-row-types';
import {
  MARKET_DOT,
  MARKET_STATE_KEY,
  marketActions,
  marketAsksAgent,
  marketRowTitle,
  marketSwitchLocked,
  type MarketRowAction,
} from './market-rows';
import { marketRowKind, packageIcon } from './market-row-icon';
import type { MarketSectionIcon } from './market-section-icon';
import { ACTION_LABEL_KEY, PROGRESS_KEY, askAgentText, type Pending } from './market-view-text';
import { FailureCard } from './FailureCard';
import { failureCardOf } from './failure-card-text';
import { AskAgentButton } from './AskAgentButton';
import styles from '../market/MarketPage.module.css';

const dangerActions: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];

const updateActions: readonly MarketRowAction[] = [
  'update',
  'update-bundle',
  'update-plugin',
  'update-workbench',
];

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

function MarketLineDialogs({
  t,
  migrationOpen,
  dismissOpen,
  onMigrationCancel,
  onMigrationConfirm,
  onDismissCancel,
  onDismissConfirm,
}: {
  readonly t: Translate;
  readonly migrationOpen: boolean;
  readonly dismissOpen: boolean;
  readonly onMigrationCancel: () => void;
  readonly onMigrationConfirm: () => void;
  readonly onDismissCancel: () => void;
  readonly onDismissConfirm: () => void;
}) {
  return (
    <>
      {migrationOpen ? (
        <MigrationConfirm t={t} onCancel={onMigrationCancel} onConfirm={onMigrationConfirm} />
      ) : null}
      {dismissOpen ? (
        <DismissFollowUpConfirm t={t} onCancel={onDismissCancel} onConfirm={onDismissConfirm} />
      ) : null}
    </>
  );
}

function MarketLineStatus({
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

function MarketFailureBlock({
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

function MarketLine({
  t,
  row,
  pending,
  failure,
  onAct,
  onDefault,
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
  boardBusy?: boolean | undefined;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const running = pending !== null && pending.id === row.id ? pending : null;
  const locked = pending !== null;
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const quiet =
    row.workbench === true && row.state === 'installed' && row.hint === undefined;
  const actions = marketActions(row);
  const asksAgent = marketAsksAgent(row);
  const switchLocked = marketSwitchLocked(row);
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
            <span className={styles.marketLocalTag}>{t('panels.market.localMark')}</span>
          ) : null}
        </span>
        <MarketLineStatus t={t} row={row} quiet={quiet} />
      </div>

      <div className={styles.marketEnd}>
        {running !== null ? (
          <span className={styles.marketProgress}>
            <Spinner size={14} />
            {t(PROGRESS_KEY[running.action])}
          </span>
        ) : actions.length === 0 && !asksAgent ? null : (
          <span className={styles.marketActions}>
            {asksAgent ? (
              <AskAgentButton
                t={t}
                text={askAgentText(row, t)}
                label={t('panels.market.askAgent')}
              />
            ) : null}
            {actions.map((action) => {
              const danger = dangerActions.includes(action);
              const update = updateActions.includes(action);
              return (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  variant={action === 'install' || action === 'migrate-workbench' ? 'primary' : 'outline'}
                  className={danger ? 'wb-dangerAction' : update ? styles.marketUpdateAction : undefined}
                  icon={danger ? <IconTrashOutlineRegular size={13} /> : undefined}
                  aria-label={
                    danger
                      ? t('panels.market.uninstallLabel', { name: marketRowTitle(row, t) })
                      : undefined
                  }
                  disabled={locked}
                  onClick={() => {
                    if (action === 'migrate-workbench') setMigrationOpen(true);
                    else if (action === 'dismiss-followup') setDismissOpen(true);
                    else onAct(action);
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

      <MarketFailureBlock t={t} failure={failure} onRecheck={onRecheck} rechecking={rechecking} />
      <MarketLineDialogs
        t={t}
        migrationOpen={migrationOpen}
        dismissOpen={dismissOpen}
        onMigrationCancel={() => setMigrationOpen(false)}
        onMigrationConfirm={() => {
          setMigrationOpen(false);
          onAct('migrate-workbench');
        }}
        onDismissCancel={() => setDismissOpen(false)}
        onDismissConfirm={() => {
          setDismissOpen(false);
          onAct('dismiss-followup');
        }}
      />
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
  readonly boardBusy?: boolean | undefined;
  readonly confirmActions: readonly MarketRowAction[];
  readonly onConfirming: (id: string | null) => void;
  readonly headAction?: ReactNode;
  readonly keepHead?: boolean;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  if (rows.length === 0 && keepHead !== true) return null;
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
              onAct={(action) =>
                confirmActions.includes(action) ? onConfirming(row.id) : void act(row.id, action)
              }
              onDefault={(next) => onDefault?.(row.id, next)}
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
