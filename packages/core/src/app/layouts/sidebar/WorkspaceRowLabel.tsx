import { createElement as h, useEffect, useRef } from 'react';
import type { ReactNode, WorkspaceView } from '@dsh-workbench/shared';
import styles from './ProjectSwitcher.module.css';

import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayNameOf } from './workspace-name';

export interface WorkspaceRowLabelProps {
  readonly workspace: WorkspaceView;
  readonly current: boolean;
  readonly action?: ReactNode;
  readonly onHover?: (hovering: boolean) => void;
}

export function WorkspaceRowLabel({ workspace, current, action, onHover }: WorkspaceRowLabelProps) {
  const { dir, name } = displayNameOf(workspace);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const hoverRef = useRef(onHover);

  useEffect(() => {
    hoverRef.current = onHover;
  });

  useEffect(() => {
    const row = hostRef.current?.closest('[role="menuitem"]');
    if (row === null || row === undefined) return;
    const enter = (): void => hoverRef.current?.(true);
    const leave = (): void => hoverRef.current?.(false);
    row.addEventListener('mouseenter', enter);
    row.addEventListener('mouseleave', leave);
    return () => {
      row.removeEventListener('mouseenter', enter);
      row.removeEventListener('mouseleave', leave);
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
