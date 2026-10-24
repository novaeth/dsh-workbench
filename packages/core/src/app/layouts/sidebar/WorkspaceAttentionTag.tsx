import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';

import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { attentionLabel, attentionWordLabel, type WorkspaceAttention } from '@/modules/sessions';
import { Tip } from '@/shared/components/Tip';
import styles from './WorkspaceAttentionTag.module.css';

export interface WorkspaceAttentionTagProps {
  readonly attention: WorkspaceAttention | null;
  readonly t: Translate;
}

export function WorkspaceAttentionTag({ attention, t }: WorkspaceAttentionTagProps) {
  if (attention === null) return null;
  return (
    <Tip label={attentionLabel(attention, t)}>
      <Tag
        tone={attention.severity === 'warning' ? 'warning' : 'success'}
        className={styles.tag}
      >
        {attentionWordLabel(attention, t)}
      </Tag>
    </Tip>
  );
}
