import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { RecordIntent, RecordState } from '@dsh-workbench/shared/host';
import { cx } from '@dsh-workbench/shared';
import { HoverCard, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import { useDiyRecordAct, useDiyRecordState } from '@/shared/hooks/use-diy-record';
import styles from './RecordFooterAction.module.css';

export interface RecordFooterActionProps {
  readonly wide?: boolean | undefined;
  readonly t: Translate;
}

export interface RecordActView {
  readonly intent: RecordIntent;
  readonly label: string;
}

export interface RecordFooterView {
  readonly label: string;
  readonly note: string;
  readonly acts: readonly RecordActView[];
}

export function recordFooterView(state: RecordState, t: Translate): RecordFooterView {
  if (state.phase === 'recording') {
    const taken = state.shots === undefined ? 0 : state.shots.length;
    return {
      label: t('record.recording'),
      note:
        taken === 0
          ? t('record.recording.note')
          : `${t('record.recording.note')}${t('record.recording.shots', { n: taken })}`,
      acts: [{ intent: 'halt', label: t('record.act.halt') }],
    };
  }
  if (state.phase === 'finished') {
    return {
      label: t('record.finished'),
      note: t('record.finished.note'),
      acts: [],
    };
  }
  return {
    label: t('record.waiting'),
    note: t('record.waiting.note'),
    acts: [{ intent: 'stop', label: t('record.act.cancel') }],
  };
}

export function RecordFooterAction({ wide, t }: RecordFooterActionProps) {
  const state = useDiyRecordState();
  const act = useDiyRecordAct();

  if (state === null) return null;
  const view = recordFooterView(state, t);
  const dot = (
    <StateDot
      state={state.phase === 'finished' ? 'done' : 'warning'}
      className={state.phase === 'armed' ? styles.pulse : undefined}
    />
  );
  const tone = state.phase === 'finished' ? styles.done : styles.live;
  const acts = (
    <span className={styles.acts}>
      {view.acts.map((one) => (
        <button
          key={one.intent}
          type="button"
          className={styles.act}
          aria-label={one.label}
          onClick={(event) => {
            event.stopPropagation();
            void act.send({ intent: one.intent });
          }}
        >
          {one.label}
        </button>
      ))}
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
            <div className={styles.cardTitle}>{view.label}</div>
            <div className={styles.cardNote}>{view.note}</div>
            {acts}
          </div>
        }
        openDelayMs={200}
      />
    </span>
  );
}
