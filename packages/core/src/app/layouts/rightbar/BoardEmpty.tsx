import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { CenteredState } from '@dsh-workbench/shared';
import { IconBrandMark } from '@dsh-workbench/shared';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import styles from './BoardEmpty.module.css';

export function BoardEmpty({
  t,
  onBuildModule,
  onOpenModules,
  onOpenMarket,
}: {
  t: Translate;
  onBuildModule: () => void;
  onOpenModules: () => void;
  onOpenMarket: () => void;
}) {
  return (
    <CenteredState
      icon={<IconBrandMark size={32} />}
      title={t('panels.empty')}
      hint={t('panels.emptyHint')}
      action={
        <div className={styles.actions}>
          <Button
            type="button"
            size="sm"
            variant="primary"
            className={styles.action}
            onClick={onBuildModule}
          >
            {t('panels.buildModule')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="toolbar"
            className={styles.action}
            onClick={onOpenModules}
          >
            {t('panels.choose')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="toolbar"
            className={styles.action}
            onClick={onOpenMarket}
          >
            {t('panels.browseMarket')}
          </Button>
        </div>
      }
    />
  );
}
