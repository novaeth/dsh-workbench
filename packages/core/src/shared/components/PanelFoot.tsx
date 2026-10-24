import { createElement as h } from 'react';
import type { ReactNode } from '@dsh-workbench/shared';

import styles from './PanelFoot.module.css';

export interface PanelFootProps {
  readonly text?: string;
  readonly size?: 'sm' | 'md';
  readonly children?: ReactNode;
}

export function PanelFoot({ text, size = 'sm', children }: PanelFootProps) {
  return (
    <footer className={styles.foot}>
      {text === undefined ? null : (
        <span className={size === 'md' ? styles.footTextMd : styles.footText}>{text}</span>
      )}
      {children ?? null}
    </footer>
  );
}
