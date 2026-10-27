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
import { ChoiceGroup, MIN_BUSY_MS, Note } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import { runtimeSidebarEdition, subscribeSidebarEdition } from '@/app/layouts/sidebar/edition';
import {
  armCustomSidebarTakeover,
  disarmCustomSidebarTakeover,
  markSidebarEditionPending,
} from '@/app/layouts/sidebar/edition-boot';
import { SettingsItem } from './SettingsItem';

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

  const choose = (next: string): void => {
    if (next !== 'official' && next !== 'custom') return;
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

  return (
    <SettingsItem title={t('sidebarEdition.nav')} description={t('sidebarEdition.lead')}>
      <ChoiceGroup
        label={t('sidebarEdition.nav')}
        name="sidebar-edition"
        value={stored ?? runtime}
        variant="boxed"
        disabled={stored === undefined || switching}
        loading={busy.busy || switching}
        loadingText={t('sidebarEdition.saving')}
        options={[
          {
            value: 'official',
            label: t('sidebarEdition.official'),
            description: t('sidebarEdition.officialHint'),
          },
          {
            value: 'custom',
            label: t('sidebarEdition.custom'),
            description: t('sidebarEdition.customHint'),
          },
        ]}
        onChange={choose}
      />
      {write.failed === null ? null : (
        <Note tone="problem" role="alert">
          {write.failed}
        </Note>
      )}
      {stored === undefined || stored === runtime ? null : (
        <Note>
          {t('sidebarEdition.reloadRequired')}{' '}
          <Button variant="ghost" size="sm" onClick={() => globalThis.location?.reload()}>
            {t('sidebarEdition.reload')}
          </Button>
        </Note>
      )}
    </SettingsItem>
  );
}
