import { createElement as h, useState, useSyncExternalStore } from 'react';
import type {
  BoardProbe,
  SessionsSnapshot,
  SnapshotSelectorHook,
  Translate,
  WorkspaceSnapshot,
} from '@dsh-workbench/shared';
import type { DebugIntent, DebugState } from '@dsh-workbench/shared/host';
import { boardSituation, cx } from '@dsh-workbench/shared';
import {
  HoverCard,
  IconPauseOutlineRegular,
  IconPlayOutlineRegular,
  IconStopFillRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import { useDiyDebugAct, useDiyDebugState } from '@/shared/hooks/use-diy-debug';
import { boardProbe, subscribeBoardProbe } from '@/app/layouts/rightbar/board-fact';
import { useBoardWorkspace } from '@/app/layouts/rightbar/use-panels';
import styles from './DebugFooterAction.module.css';

export interface DebugFooterActionProps {
  readonly wide?: boolean | undefined;
  readonly t: Translate;
  readonly useWorkspaces?: SnapshotSelectorHook<WorkspaceSnapshot> | undefined;
  readonly useSessions?: SnapshotSelectorHook<SessionsSnapshot> | undefined;
}

export type DebugTrouble =
  | 'workspace'
  | 'panel'
  | 'none';

export interface DebugFooterView {
  readonly label: string;
  readonly title: string;
  readonly note: string;
  readonly trouble: DebugTrouble;
  readonly stalled: boolean;
}

export function debugFooterView(
  state: DebugState,
  t: Translate,
  trouble: DebugTrouble = 'none',
): DebugFooterView {
  const shown: DebugTrouble = state.phase === 'paused' ? 'none' : trouble;
  const title = state.title === '' ? t('debug.workspace') : state.title;
  const label =
    shown !== 'none'
      ? t('debug.status.trouble', { title })
      : state.phase === 'paused'
        ? t('debug.stalled', { title })
        : t('debug.status', { title });
  const noteOf = (kind: DebugTrouble): string =>
    kind === 'panel' ? t('debug.card.hidden.note') : t('debug.card.away.note', { title });

  if (state.phase === 'paused') {
    return { label, title: label, note: t('debug.card.paused.note'), trouble: 'none', stalled: true };
  }

  if (shown !== 'none') {
    return { label, title: label, note: noteOf(shown), trouble: shown, stalled: false };
  }

  return {
    label,
    title: t('debug.card.here.title', { title }),
    note: t('debug.card.here.note'),
    trouble: 'none',
    stalled: false,
  };
}

const EMPTY_WORKSPACES: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [] };
const EMPTY_SESSIONS: SessionsSnapshot = { byId: {}, projectionsBySession: {} };

export function DebugFooterAction({ wide, t, useWorkspaces, useSessions }: DebugFooterActionProps) {
  const state = useDiyDebugState();
  const act = useDiyDebugAct();
  const probe = useSyncExternalStore(subscribeBoardProbe, boardProbe);
  const workspaces = useWorkspaces?.((snapshot) => snapshot) ?? EMPTY_WORKSPACES;
  const sessions = useSessions?.((snapshot) => snapshot) ?? EMPTY_SESSIONS;
  const here = useBoardWorkspace(workspaces, sessions);
  const [armed, setArmed] = useState(false);

  if (state === null) return null;
  const workspacePath = state.workspacePath === undefined || state.workspacePath === '' ? null : state.workspacePath;
  const full: BoardProbe = { ...probe, where: here.path ?? '' };
  const situation = boardSituation(full, workspacePath);
  const trouble: DebugTrouble =
    situation === 'off-workspace' || situation === 'other-board'
      ? 'workspace'
      : situation === 'panel-closed'
        ? 'panel'
        : 'none';
  const view = debugFooterView(state, t, trouble);
  const dot = (
    <StateDot
      state={view.trouble !== 'none' ? 'error' : view.stalled ? 'warning' : 'done'}
      className={view.trouble === 'none' && !view.stalled ? styles.pulse : undefined}
    />
  );
  const tone = view.trouble !== 'none' ? styles.trouble : view.stalled ? styles.paused : styles.live;

  const press = (intent: DebugIntent) => (event: { stopPropagation(): void }) => {
    event.stopPropagation();
    void act.send({ intent });
  };
  const onStop = (event: { stopPropagation(): void }): void => {
    event.stopPropagation();
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    void act.send({ intent: 'stop' });
  };
  const acts = (
    <span className={styles.acts}>
      {view.stalled ? (
        <button
          type="button"
          className={styles.act}
          aria-label={t('debug.act.resume')}
          onClick={press('resume')}
        >
          <IconPlayOutlineRegular size={12} />
        </button>
      ) : (
        <button
          type="button"
          className={styles.act}
          aria-label={t('debug.act.pause')}
          onClick={press('pause')}
        >
          <IconPauseOutlineRegular size={12} />
        </button>
      )}
      <button
        type="button"
        className={cx(styles.act, styles.actStop, armed ? styles.actArmed : undefined)}
        data-act-state={armed ? 'armed' : 'idle'}
        aria-label={armed ? t('debug.act.stop.ask') : t('debug.act.stop')}
        onClick={onStop}
        onBlur={() => setArmed(false)}
      >
        <IconStopFillRegular size={12} />
        {armed ? <span className={styles.actLabel}>{t('debug.act.stop.ask')}</span> : null}
      </button>
    </span>
  );

  const status = (
    <span className={styles.entryInner}>
      {dot}
      {wide === true ? <span className={styles.entryLine}>{view.label}</span> : null}
    </span>
  );
  const row = (
    <div className={cx(styles.action, wide === true ? undefined : styles.actionRail, tone)}>
      <span className={styles.entry} role="status" aria-label={`${view.label}，${view.note}`}>
        {wide === true ? (
          <Tip label={view.note} side="top">
            {status}
          </Tip>
        ) : (
          status
        )}
      </span>
      {wide === true ? acts : null}
    </div>
  );

  if (wide === true) {
    return <span className={styles.slot}>{row}</span>;
  }
  return (
    <span className={styles.slot}>
      <HoverCard
        anchor={row}
        content={
          <div className={styles.card}>
            <div className={styles.cardTitle}>{view.title}</div>
            <div className={styles.cardNote}>{view.note}</div>
            {acts}
          </div>
        }
        openDelayMs={200}
      />
    </span>
  );
}
