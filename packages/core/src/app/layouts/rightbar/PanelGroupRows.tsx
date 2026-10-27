import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';

import type { PanelRow } from './board-selection';
import { PanelRowControls } from './PanelRowControls';
import styles from './ModulesPage.module.css';

export interface PanelGroupRowsProps {
  readonly t: Translate;
  readonly rows: readonly PanelRow[];
  readonly titleKey: string;
  readonly busy: boolean;
  readonly onWrite: (body: Record<string, unknown>) => void;
}

export function PanelGroupRows({ t, rows, titleKey, busy, onWrite }: PanelGroupRowsProps) {
  if (rows.length === 0) return null;

  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{t(titleKey)}</h3>
      <ul className={styles.list}>
        {rows.map((row) => {
          const title = row.title ?? t(row.titleKey ?? row.id);
          return (
            <li key={row.id} className={`${styles.row} ${row.shown ? '' : styles.rowOff}`}>
              <span aria-hidden="true" />
              <span className={styles.label}>
                <span className={styles.name}>{title}</span>
                {row.badgeKey === undefined ? null : (
                  <span className={styles.dep}>{t(row.badgeKey)}</span>
                )}
              </span>
              <PanelRowControls t={t} unit={row} label={title} busy={busy} onWrite={onWrite} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
