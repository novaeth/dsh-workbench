import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import { IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './SettingsDisclosure.module.css';

export interface SettingsDisclosureProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly meta?: string | undefined;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

export function SettingsDisclosure({
  title,
  description,
  meta,
  open,
  onToggle,
  children,
}: SettingsDisclosureProps): JSX.Element {
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.head}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {description === undefined ? null : <span className={styles.description}>{description}</span>}
        </span>
        <span className={styles.tail}>
          {meta === undefined || meta === '' ? null : <span className={styles.meta}>{meta}</span>}
          <span className={styles.chevron} aria-hidden="true">
            <IconChevronRightOutlineRegular size={16} />
          </span>
        </span>
      </button>
      {open ? (
        <div className={styles.panel}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
