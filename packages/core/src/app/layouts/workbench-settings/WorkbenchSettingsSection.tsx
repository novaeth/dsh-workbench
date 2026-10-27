import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { SettingsSection } from '@dsh-workbench/shared';
import { clientSurface } from '@/shared/api/platform/client';
import { AdapterSetItem } from './AdapterSetItem';
import { ConfigSyncItem } from './ConfigSyncItem';
import { NewWorkbenchItem } from './NewWorkbenchItem';
import { SidebarEditionItem } from './SidebarEditionItem';
import styles from './WorkbenchSettingsSection.module.css';

export interface WorkbenchSettingsSectionProps {
  readonly t: Translate;
}

export function WorkbenchSettingsSection({ t }: WorkbenchSettingsSectionProps): JSX.Element {
  const desktop = clientSurface().deployment === 'desktop';
  return (
    <SettingsSection
      label={t('workbenchSettings.nav')}
      title={<span className={styles.title}>{t('workbenchSettings.nav')}</span>}
    >
      <div className={styles.body}>
        <p className={styles.lead}>{t('workbenchSettings.lead')}</p>
        <AdapterSetItem t={t} />
        <SidebarEditionItem t={t} />
        <ConfigSyncItem t={t} />
        {desktop ? null : <NewWorkbenchItem t={t} />}
      </div>
    </SettingsSection>
  );
}
