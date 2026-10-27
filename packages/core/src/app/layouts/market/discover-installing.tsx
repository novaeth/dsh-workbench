import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Spinner } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './MarketPage.module.css';

export interface DiscoverInstallingProps {
  readonly t: Translate;
  readonly name: string;
  readonly cancelling: boolean;
  readonly onCancel: () => void;
}

export function DiscoverInstalling({ t, name, cancelling, onCancel }: DiscoverInstallingProps) {
  return (
    <p className={styles.discoverInstallBar} role="status">
      <Spinner size={14} />
      <span className={styles.discoverInstallText}>{t('panels.discover.installingNamed', { name })}</span>
      <Button type="button" variant="outline" size="sm" disabled={cancelling} aria-busy={cancelling} onClick={onCancel}>
        {t(cancelling ? 'panels.discover.cancelling' : 'panels.discover.cancelInstall')}
      </Button>
    </p>
  );
}
