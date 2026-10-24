import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';

import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './ModulesPage.module.css';

export interface PanelRowUnit {
  readonly id: string;
  readonly shown: boolean;
}

export interface PanelRowControlsProps {
  readonly t: Translate;
  readonly unit: PanelRowUnit;
  readonly label: string;
  readonly busy: boolean;
  readonly onWrite: (body: Record<string, unknown>) => void;
}

export function PanelRowControls({ t, unit, label, busy, onWrite }: PanelRowControlsProps) {
  return (
    <span className={styles.rowControls}>
      <Switch
        checked={unit.shown}
        label={`${label} · ${unit.shown ? t('panels.enabled') : t('panels.disabled')}`}
        disabled={busy}
        onChange={(next) => onWrite({ action: next ? 'show' : 'hide', id: unit.id })}
      />
    </span>
  );
}
