import type { ReactNode } from 'react';
import { createElement as h } from 'react';
import { Link, type CardViewTone } from '@dsh-workbench/shared';
import styles from './SchemaRow.module.css';

export interface SchemaRowProps {
  readonly title: ReactNode;
  readonly meta?: ReactNode | undefined;
  readonly dot?: ReactNode | undefined;
  readonly at?: string | undefined;
  readonly atTone?: CardViewTone | undefined;
  readonly atTitle?: string | undefined;
  readonly href?: string | undefined;
  readonly action?: ReactNode | undefined;
  readonly actions?: ReactNode | undefined;
}

const AT_TONE: Record<CardViewTone, string> = {
  neutral: styles.atNeutral,
  ok: styles.atOk,
  warn: styles.atWarn,
  bad: styles.atBad,
  busy: styles.atBusy,
};

export function SchemaRow({ title, meta, dot, at, atTone, atTitle, href, action, actions }: SchemaRowProps) {
  return (
    <div className={styles.row}>
      {dot === undefined ? null : <span className={styles.dot}>{dot}</span>}
      <span className={styles.main}>
        <span className={styles.title}>
          {href === undefined ? title : <Link href={href}>{title}</Link>}
        </span>
        {meta === undefined ? null : <span className={styles.meta}>{meta}</span>}
      </span>
      {at === undefined ? null : (
        <span
          className={`${styles.at} ${AT_TONE[atTone ?? 'neutral']}`}
          {...(atTitle === undefined ? {} : { title: atTitle })}
        >
          {at}
        </span>
      )}
      {action === undefined && actions === undefined ? null : (
        <span className={styles.action}>
          {action}
          {actions}
        </span>
      )}
    </div>
  );
}
