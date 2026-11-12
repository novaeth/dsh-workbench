import { createElement as h, useEffect, useMemo } from 'react';
import type { Translate, WorkspaceView } from '@dsh-workbench/shared';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  IconEditOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconTrashOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { clientSurface } from '@/shared/api/platform/client';
import { shouldToggleWorkspaceMenu } from './workspace-menu-toggle';
import styles from './WorkspaceRowMenu.module.css';

export const WORKSPACE_MENU_TRIGGER = 'data-workspace-menu-trigger';

export interface WorkspaceMenuAnchor {
  readonly element: HTMLElement;
  readonly align: 'start' | 'end';
}

export interface WorkspaceMenuOpen extends WorkspaceMenuAnchor {
  readonly mode: 'toggle' | 'open';
}

export interface WorkspaceMenuTarget extends WorkspaceMenuAnchor {
  readonly workspace: WorkspaceView;
}

export function nextWorkspaceMenu(
  current: WorkspaceMenuTarget | null,
  workspace: WorkspaceView,
  open: WorkspaceMenuOpen,
): WorkspaceMenuTarget | null {
  const openFor = current?.workspace.workspaceId ?? null;
  if (shouldToggleWorkspaceMenu(open.mode, openFor, workspace.workspaceId)) return null;
  return { workspace, element: open.element, align: open.align };
}

export interface WorkspaceRowMenuProps {
  readonly target: WorkspaceMenuTarget | null;
  readonly t: Translate;
  readonly onClose: () => void;
  readonly onAlias: (workspace: WorkspaceView) => void;
  readonly onDelete: (workspace: WorkspaceView) => void;
  readonly onReveal: (path: string) => void;
}

export function WorkspaceRowMenu({ target, t, onClose, onAlias, onDelete, onReveal }: WorkspaceRowMenuProps) {
  const items = useMemo((): readonly MenuEntry[] => {
    if (target === null) return [];
    return [
      {
        id: 'alias',
        label: t('project.menu.alias'),
        icon: <IconEditOutlineRegular size={14} />,
      },
      {
        id: 'reveal',
        label: t(
          clientSurface().capabilities.macFileManager ? 'project.menu.reveal.finder' : 'project.menu.reveal.folder',
        ),
        icon: <IconFolderOpenOutlineRegular size={14} />,
      },
      { type: 'separator', id: 'workspace-menu-separator' },
      {
        id: 'delete',
        label: t('project.menu.delete'),
        icon: <IconTrashOutlineRegular size={14} />,
        danger: true,
      },
    ];
  }, [target, t]);
  const open = target !== null;
  const anchorRef = useMemo(() => ({ current: target?.element ?? null }), [target]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event): void => {
      const node = event.target;
      if (!(node instanceof Element)) return;
      if (node.closest(`.${styles.list}`) !== null) return;
      if (node.closest(`[${WORKSPACE_MENU_TRIGGER}]`) !== null) {
        event.stopPropagation();
        return;
      }
      onClose();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open, onClose]);

  return (
    <Menu
      open={open}
      onClose={onClose}
      onSelect={(id) => {
        const workspace = target?.workspace;
        onClose();
        if (workspace === undefined) return;
        if (id === 'alias') {
          onAlias(workspace);
          return;
        }
        if (id === 'delete') {
          onDelete(workspace);
          return;
        }
        onReveal(workspace.path);
      }}
      items={items}
      anchor={null}
      portal
      autoFocus
      align={target?.align ?? 'end'}
      anchorRef={anchorRef}
      className={styles.anchor}
      listClassName={styles.list}
    />
  );
}
