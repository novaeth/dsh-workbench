import { createElement as h, useSyncExternalStore } from 'react';
import type { SnapshotSelectorHook, Translate } from '@dsh-workbench/shared';
import { IconBrandMark } from '@dsh-workbench/shared';
import { Tip } from '@/shared/components/Tip';
import { Button, IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { pressedColumns, type RightbarColumn, type RightbarState } from './store';
import type { DshColumnSource } from './dsh-column-source';
import styles from './ColumnSwitch.module.css';

export interface ColumnSwitchProps {
  useRightbar: SnapshotSelectorHook<RightbarState>;
  selectColumn: (column: RightbarColumn) => void;
  dshColumn: DshColumnSource;
  t: Translate;
}

export function ColumnSwitch({ useRightbar, selectColumn, dshColumn, t }: ColumnSwitchProps) {
  const state = useRightbar((snapshot) => snapshot);
  const dshOpen = useSyncExternalStore(dshColumn.subscribe, dshColumn.getSnapshot);
  const pressed = pressedColumns(state, dshOpen);
  const workbenchLabel = pressed.workbench ? t('rightbar.collapse') : t('rightbar.column.workbench');

  return (
    <span className={styles.group} role="group" aria-label={t('rightbar.column.label')}>
      <Tip label={workbenchLabel}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={pressed.workbench ? `${styles.button} ${styles.active}` : styles.button}
          aria-pressed={pressed.workbench}
          aria-label={workbenchLabel}
          icon={
            <span className={styles.icon}>
              <IconBrandMark size={15} />
            </span>
          }
          onClick={() => selectColumn('workbench')}
        />
      </Tip>
      <Tip label={t('rightbar.column.dsh')}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={pressed.dsh ? `${styles.button} ${styles.active}` : styles.button}
          aria-pressed={pressed.dsh}
          aria-label={t('rightbar.column.dsh')}
          icon={
            <span className={`${styles.icon} ${styles.mirror}`}>
              <IconPanelLeftOutlineRegular size={15} />
            </span>
          }
          onClick={() => selectColumn('dsh')}
        />
      </Tip>
    </span>
  );
}
