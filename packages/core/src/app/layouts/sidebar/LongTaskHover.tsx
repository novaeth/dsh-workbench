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
  if (edition !== 'official' || !presence.bySession.has(sessionId)) return null;
  return (
    <div className={styles.hover}>
      <StateDot state="ongoing" />
      <span>{t('status.longTask')}</span>
    </div>
  );
}
