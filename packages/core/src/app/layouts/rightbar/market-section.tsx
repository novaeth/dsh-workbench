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
  MARKET_STATE_KEY,
  marketActions,
  marketDotOf,
  marketRowTitle,
  marketSwitchLocked,
} from './market-rows';
import { UPDATE_ACTIONS, actionLabelKey, depsOnlyInstall, progressKeyOf, type Pending } from './market-view-text';
import { packageIcon, marketRowKind } from './market-row-icon';
import type { MarketSectionIcon } from './market-section-icon';
import { BuildApproval } from './BuildApproval';
import { FailureCard } from './FailureCard';
import { failureCardOf } from './failure-card-text';
import { rowProblemCardOf } from './market-problem-card';
import styles from '../market/MarketPage.module.css';

const CONFIRM_DANGER = ['uninstall', 'remove-bundle', 'uninstall-plugin'] as const satisfies readonly MarketRowAction[];

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
  const stateText = t(row.stateKey ?? MARKET_STATE_KEY[row.state]);
  const hiddenNote = row.problem !== undefined && row.problem.kind !== 'startup';
  const noteText = row.note === undefined || hiddenNote ? null : t(row.note.key, row.note.params);
  if (quiet) return null;
  return (
    <span className={styles.marketStatus}>
      {row.state === 'checking' ? (
        <Spinner size={14} />
      ) : (
        <StateDot state={marketDotOf(row)} size={9} />
      )}
      <span className={styles.marketStateText}>{stateText}</span>
      {row.staleDeps === undefined || row.moduleUpdate !== undefined ? null : (
        <>
          <span className={styles.marketSep} aria-hidden="true">·</span>
          <span className={styles.marketReason}>{t('panels.market.depsHaveUpdate')}</span>
        </>
      )}
      {row.hint === undefined ? null : (
        <>
          <span className={styles.marketSep} aria-hidden="true">·</span>
          <span className={styles.marketReason}>{t(row.hint.key, row.hint.params)}</span>
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
  onApprove,
}: {
  readonly t: Translate;
  readonly failure: MarketFailure | null;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
  readonly onApprove?: (() => void) | undefined;
}) {
  if (failure === null) return null;
  const builds = failure.pendingBuilds ?? [];
  if (builds.length > 0 && onApprove !== undefined) {
    return (
      <div className={styles.marketFailureSeat}>
        <BuildApproval t={t} packages={builds} action={failure.action} onApprove={onApprove} />
      </div>
    );
  }
  const model =
    failure.card ?? (failure.failure === undefined ? undefined : failureCardOf(failure.failure, t));
  if (model !== undefined) {
    return (
      <div className={styles.marketFailureSeat}>
        <FailureCard t={t} model={model} extras={failure.card} onRecheck={onRecheck} rechecking={rechecking} />
      </div>
    );
  }
  return <div className={styles.marketFailure}>{failure.message}</div>;
}

function ActionLabel({
  t,
  row,
  action,
}: {
  readonly t: Translate;
  readonly row: MarketRow;
  readonly action: MarketRowAction;
}) {
  return <>{t(actionLabelKey(row, action))}</>;
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
  const depsLocked = row.state === 'missing' && row.version?.installed !== undefined;
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  return (
    <>
      {running !== null ? (
        <span className={styles.marketProgress}>
          <Spinner size={14} />
          {t(progressKeyOf(row, running.action))}
        </span>
      ) : actions.length === 0 ? null : (
        <span className={styles.marketActions}>
          {actions.map((action) => {
            const danger = CONFIRM_DANGER.some((one) => one === action);
            const update = UPDATE_ACTIONS.includes(action) || depsOnlyInstall(row, action);
            return (
              <Button
                key={action}
                type="button"
                size="sm"
                variant="outline"
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
                <ActionLabel t={t} row={row} action={action} />
              </Button>
            );
          })}
        </span>
      )}
      {row.defaultShown === undefined ? null : (
        <Tip
          label={t(
            depsLocked
              ? 'panels.market.defaultNeedsDeps'
              : switchLocked
                ? 'panels.market.defaultLocked'
                : 'panels.market.defaultHint',
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
  onApprove,
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
  onApprove?: (() => void) | undefined;
  onDefault?: ((next: boolean) => void) | undefined;
  onOpenDetail?: ((id: string) => void) | undefined;
  boardBusy?: boolean | undefined;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const title = marketRowTitle(row, t);
  const quiet = row.workbench === true && row.state === 'installed' && row.hint === undefined;
  const clickable = row.pkg !== undefined && onOpenDetail !== undefined;
  const problemModel = row.problem === undefined ? undefined : rowProblemCardOf(t, row);
  const problemAction =
    row.problem?.kind === 'drift'
      ? () => onAct('install-version')
      : row.problem?.kind === 'reinstall'
        ? () => onAct('update-workbench')
        : onRecheck;
  const failureAction = failure?.retry === 'update-workbench' ? () => onAct('update-workbench') : onRecheck;
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

      {problemModel === undefined || failure !== null ? null : (
        <div className={styles.marketFailureSeat}>
          <FailureCard t={t} model={problemModel} extras={problemModel} onRecheck={problemAction} rechecking={rechecking} />
        </div>
      )}

      <MarketRowFailure
        t={t}
        failure={failure}
        onRecheck={failureAction}
        rechecking={rechecking}
        onApprove={onApprove}
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
  onOpenDetail,
  boardBusy,
  headAction,
  titleNote,
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
  readonly act: (id: string, action: MarketRowAction, options?: { approvedBuilds?: readonly string[] | undefined }) => Promise<void>;
  readonly onDefault?: ((id: string, next: boolean) => void) | undefined;
  readonly onOpenDetail?: ((id: string) => void) | undefined;
  readonly boardBusy?: boolean | undefined;
  readonly confirmActions: readonly MarketRowAction[];
  readonly onConfirming: (id: string | null) => void;
  readonly headAction?: ReactNode;
  readonly titleNote?: ReactNode;
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
          {titleNote === undefined ? null : titleNote}
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
              onApprove={() => {
                const failed = failureOf(row.id);
                if (failed?.pendingBuilds !== undefined && failed.action !== undefined) {
                  void act(row.id, failed.action, { approvedBuilds: failed.pendingBuilds });
                }
              }}
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
