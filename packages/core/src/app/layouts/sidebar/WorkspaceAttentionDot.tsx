import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { cx } from '@dsh-workbench/shared';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { attentionLabel, type WorkspaceAttention } from '@/modules/sessions';
import { Tip } from '@/shared/components/Tip';
import styles from './WorkspaceAttentionDot.module.css';

export interface WorkspaceAttentionDotProps {
  readonly attention: WorkspaceAttention | null;
  readonly t: Translate;
  readonly variant?: 'inline' | 'overlay';
  readonly tip?: boolean;
}

export function WorkspaceAttentionDot({
  attention,
  t,
  variant = 'inline',
  tip = false,
}: WorkspaceAttentionDotProps) {
  if (attention === null) return null;
  const label = attentionLabel(attention, t);
  const dot = (
    <span
      className={variant === 'overlay' ? cx(styles.dot, styles.overlay) : styles.dot}
      role="img"
      aria-label={label}
    >
      <StateDot state={attention.severity} size={variant === 'overlay' ? 9 : undefined} />
    </span>
  );
  return tip ? <Tip label={label}>{dot}</Tip> : dot;
}
