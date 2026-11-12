import { createElement as h, useId } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { clientSurface } from '@/shared/api/platform/client';
import { AdapterSetItem } from './AdapterSetItem';
import { ConfigSyncItem } from './ConfigSyncItem';
import { McpOnDemandItem } from './McpOnDemandItem';
import { NewWorkbenchItem } from './NewWorkbenchItem';
import { SidebarEditionItem } from './SidebarEditionItem';
import { UpdatePrereleaseItem } from './UpdatePrereleaseItem';
import styles from './WorkbenchSettingsSection.module.css';

export interface WorkbenchSettingsSectionProps {
  readonly t: Translate;
}

export function WorkbenchSettingsSection({ t }: WorkbenchSettingsSectionProps): JSX.Element {
  const desktop = clientSurface().deployment === 'desktop';
  const pageTitleId = useId();
  const advancedTitleId = useId();
  return (
    <section className={styles.page} aria-labelledby={pageTitleId}>
      <header className={styles.head}>
        <h2 id={pageTitleId} className={styles.title}>{t('workbenchSettings.nav')}</h2>
        <p className={styles.lead}>{t('workbenchSettings.lead')}</p>
      </header>
      <div className={styles.rows}>
        <AdapterSetItem t={t} />
        <SidebarEditionItem t={t} />
        <McpOnDemandItem t={t} />
        <UpdatePrereleaseItem t={t} />
      </div>
      <section className={styles.advanced} aria-labelledby={advancedTitleId}>
        <h3 id={advancedTitleId} className={styles.advancedTitle}>{t('workbenchSettings.advanced')}</h3>
        <ConfigSyncItem t={t} />
        {desktop ? null : <NewWorkbenchItem t={t} />}
      </section>
    </section>
  );
}
