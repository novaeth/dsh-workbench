import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import styles from './SettingsItem.module.css';

export interface SettingsItemProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly action?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
}

export function SettingsItem({ title, description, action, children }: SettingsItemProps): JSX.Element {
  return (
    <section className={styles.item} aria-label={title}>
      <header className={styles.head}>
        <span className={styles.title}>{title}</span>
        {action}
      </header>
      {description === undefined ? null : <p className={styles.description}>{description}</p>}
      {children}
    </section>
  );
}
