import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';

import { IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './SafetyNote.module.css';

export function SafetyNote({ t }: { t: Translate }) {
  return (
    <p className={styles.note} role="note">
      <IconWarningOutlineRegular size={14} aria-hidden="true" />
      <span>{t('panels.market.add.guideSafety')}</span>
    </p>
  );
}
