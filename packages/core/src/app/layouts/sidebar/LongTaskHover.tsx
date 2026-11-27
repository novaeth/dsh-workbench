import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { useLongTaskPresence } from './use-attention';
import { useRuntimeSidebarEdition } from './edition';
import styles from './LongTaskDot.module.css';

export interface LongTaskHoverProps {
  readonly sessionId: string;
  readonly t: Translate;
}

export function LongTaskHover({ sessionId, t }: LongTaskHoverProps): JSX.Element | null {
  const edition = useRuntimeSidebarEdition();
  const presence = useLongTaskPresence();
  const waiting = presence.waitingBySession.has(sessionId);
  const live = presence.bySession.has(sessionId);
  const done = presence.doneBySession.has(sessionId);
  if (edition !== 'official' || (!waiting && !live && !done)) return null;
  return (
    <div className={styles.hover}>
      <StateDot state={waiting ? 'warning' : live ? 'ongoing' : 'done'} />
      <span>{t(waiting ? 'status.longTaskWaiting' : live ? 'status.longTask' : 'status.longTaskDone')}</span>
    </div>
  );
}
