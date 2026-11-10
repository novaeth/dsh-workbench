import { createElement as h } from 'react';
import type { Translate, WorkspaceView } from '@dsh-workbench/shared';
import styles from './ProjectSwitcher.module.css';

import { Button, IconEllipsisOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayNameOf } from './workspace-name';
import type { WorkspaceMenuOpen } from './WorkspaceRowMenu';

export interface WorkspaceRowActionProps {
  readonly workspace: WorkspaceView;
  readonly t: Translate;
  readonly onMenu: (open: WorkspaceMenuOpen) => void;
}

export function WorkspaceRowAction({ workspace, t, onMenu }: WorkspaceRowActionProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={styles.rowAction}
      icon={<IconEllipsisOutlineRegular size={14} />}
      aria-label={t('project.menu.row', { name: displayNameOf(workspace).dir })}
      aria-haspopup="menu"
      data-workspace-menu-trigger=""
      onClick={(event) => {
        event.stopPropagation();
        onMenu({ anchor: event.currentTarget.getBoundingClientRect(), align: 'end', mode: 'toggle' });
      }}
    />
  );
}
