import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Tip } from '@/shared/components/Tip';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { useLongTaskPresence } from './use-attention';
import styles from './LongTaskDot.module.css';

export interface LongTaskDotProps {
  readonly sessionId: string;
  readonly t: Translate;
}

export function LongTaskDot({ sessionId, t }: LongTaskDotProps): JSX.Element | null {
  const presence = useLongTaskPresence();
  const waiting = presence.waitingBySession.has(sessionId);
  const live = presence.bySession.has(sessionId);
  const done = presence.doneBySession.has(sessionId);
  if (!waiting && !live && !done) return null;
  const label = t(waiting ? 'status.longTaskWaiting' : live ? 'status.longTask' : 'status.longTaskDone');
  return (
    <Tip label={label}>
      <span className={styles.dot} role="img" aria-label={label}>
        <StateDot state={waiting ? 'warning' : live ? 'ongoing' : 'done'} />
      </span>
    </Tip>
  );
}
