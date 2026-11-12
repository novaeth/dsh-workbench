import { createElement as h, useEffect, useRef } from 'react';
import type { ReactNode, WorkspaceView } from '@dsh-workbench/shared';
import styles from './ProjectSwitcher.module.css';

import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayNameOf } from './workspace-name';
import type { WorkspaceMenuOpen } from './WorkspaceRowMenu';

export interface WorkspaceRowLabelProps {
  readonly workspace: WorkspaceView;
  readonly current: boolean;
  readonly action?: ReactNode;
  readonly onHover?: (hovering: boolean) => void;
  readonly onMenu?: (open: WorkspaceMenuOpen) => void;
}

export function WorkspaceRowLabel({ workspace, current, action, onHover, onMenu }: WorkspaceRowLabelProps) {
  const { dir, name } = displayNameOf(workspace);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const hoverRef = useRef(onHover);
  const menuRef = useRef(onMenu);

  useEffect(() => {
    hoverRef.current = onHover;
    menuRef.current = onMenu;
  });

  useEffect(() => {
    const row = hostRef.current?.closest<HTMLElement>('[role="menuitem"]');
    if (row === null || row === undefined) return;
    const enter = (): void => hoverRef.current?.(true);
    const leave = (): void => hoverRef.current?.(false);
    const show = (event: Event, point: { x: number; y: number }): void => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      row.focus({ preventScroll: true });
      menuRef.current?.({ point, align: 'start', mode: 'open' });
    };
    const context = (event: MouseEvent): void => {
      const keyboard = event.clientX === 0 && event.clientY === 0;
      const rect = keyboard ? row.getBoundingClientRect() : null;
      show(event, { x: rect?.left ?? event.clientX, y: rect?.bottom ?? event.clientY });
    };
    const keys = (event: KeyboardEvent): void => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
      const rect = row.getBoundingClientRect();
      show(event, { x: rect.left, y: rect.bottom });
    };
    row.addEventListener('mouseenter', enter);
    row.addEventListener('mouseleave', leave);
    row.addEventListener('contextmenu', context);
    row.addEventListener('keydown', keys);
    return () => {
      row.removeEventListener('mouseenter', enter);
      row.removeEventListener('mouseleave', leave);
      row.removeEventListener('contextmenu', context);
      row.removeEventListener('keydown', keys);
    };
  }, []);

  return (
    <span ref={hostRef} className={styles.row}>
      <span className={styles.dir}>{dir}</span>
      {name === '' ? null : (
        <span className={styles.name} title={name}>
          {name}
        </span>
      )}
      <span className={styles.trailing}>
        {action ??
          (current ? (
            <span className={styles.current}>
              <IconCheckOutlineRegular size={12} />
            </span>
          ) : null)}
      </span>
    </span>
  );
}
