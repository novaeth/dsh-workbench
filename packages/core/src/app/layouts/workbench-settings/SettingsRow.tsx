import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import styles from './SettingsRow.module.css';

export interface SettingsRowProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly control?: ReactNode | undefined;
  readonly error?: string | null | undefined;
  readonly children?: ReactNode | undefined;
}

export function SettingsRow({ title, description, control, error, children }: SettingsRowProps): JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        {description === undefined ? null : <div className={styles.description}>{description}</div>}
        {error === null || error === undefined ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
      {control === undefined ? null : <div className={styles.control}>{control}</div>}
    </div>
  );
}
