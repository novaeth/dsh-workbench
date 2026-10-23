import { createElement as h } from 'react';
import type { Translate, WorkspaceView } from '@dsh-workbench/shared';
import styles from './ProjectSwitcher.module.css';

import { Button, IconEditOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayNameOf } from './workspace-name';

export interface WorkspaceRowActionProps {
  readonly workspace: WorkspaceView;
  readonly t: Translate;
  readonly onEdit: () => void;
}

export function WorkspaceRowAction({ workspace, t, onEdit }: WorkspaceRowActionProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={styles.rowAction}
      icon={<IconEditOutlineRegular size={14} />}
      aria-label={t('project.rename.row', { name: displayNameOf(workspace).dir })}
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
    />
  );
}
