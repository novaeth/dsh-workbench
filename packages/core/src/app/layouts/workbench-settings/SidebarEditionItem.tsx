import { createElement as h, useEffect, useState } from 'react';
import type {
  SidebarEdition,
  SidebarEditionApplied,
  SidebarEditionSnapshot,
} from '@/kernel/contract/sidebar-edition';
import {
  SIDEBAR_EDITION_RESOURCE,
  SIDEBAR_EDITION_ROUTE,
} from '@/kernel/contract/sidebar-edition';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { Button, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import { runtimeSidebarEdition, subscribeSidebarEdition } from '@/app/layouts/sidebar/edition';
import {
  armCustomSidebarTakeover,
  disarmCustomSidebarTakeover,
  markSidebarEditionPending,
} from '@/app/layouts/sidebar/edition-boot';
import { SettingsRow } from './SettingsRow';
import styles from './SidebarEditionItem.module.css';

export interface SidebarEditionItemProps {
  readonly t: Translate;
}

export function SidebarEditionItem({ t }: SidebarEditionItemProps): JSX.Element {
  const [runtime, setRuntime] = useState<SidebarEdition>(runtimeSidebarEdition);
  const [switching, setSwitching] = useState(false);
  const snapshot = useApiResource<SidebarEditionSnapshot>(SIDEBAR_EDITION_ROUTE, {}, 0);
  const write = useHostWrite<SidebarEditionApplied>({
    channel: 'actions',
    resource: SIDEBAR_EDITION_RESOURCE,
    networkText: t('sidebarEdition.failed'),
  });
  const busy = useVisibleBusy(write.busy, MIN_BUSY_MS);
  const stored =
    snapshot.phase === 'ready' && snapshot.value !== undefined ? snapshot.value.edition : undefined;

  useEffect(() => subscribeSidebarEdition(() => setRuntime(runtimeSidebarEdition())), []);

  const choose = (next: SidebarEdition): void => {
    if (next === 'custom') armCustomSidebarTakeover();
    void write.send({ edition: next }).then((outcome) => {
      if (!outcome.ok) {
        if (next === 'custom') disarmCustomSidebarTakeover();
        return;
      }
      setSwitching(true);
      if (next === 'official') {
        markSidebarEditionPending('official');
        setTimeout(() => globalThis.location?.reload(), 50);
        return;
      }
      setTimeout(() => setSwitching(false), 4000);
    });
  };

  const current: SidebarEdition = stored ?? runtime;
  const description =
    busy.busy || switching
      ? t('sidebarEdition.saving')
      : current === 'official'
        ? t('sidebarEdition.officialHint')
        : t('sidebarEdition.customHint');

  return (
    <SettingsRow
      title={t('sidebarEdition.nav')}
      description={description}
      error={write.failed}
      control={
        <SegmentedControl
          id="sidebar-edition"
          label={t('sidebarEdition.nav')}
          value={current}
          disabled={stored === undefined || switching || busy.busy}
          onChange={choose}
          options={[
            { value: 'official', label: t('sidebarEdition.official') },
            { value: 'custom', label: t('sidebarEdition.custom') },
          ]}
        />
      }
    >
      {stored === undefined || stored === runtime ? null : (
        <div className={styles.reload}>
          <span>{t('sidebarEdition.reloadRequired')}</span>
          <Button variant="ghost" size="sm" onClick={() => globalThis.location?.reload()}>
            {t('sidebarEdition.reload')}
          </Button>
        </div>
      )}
    </SettingsRow>
  );
}
