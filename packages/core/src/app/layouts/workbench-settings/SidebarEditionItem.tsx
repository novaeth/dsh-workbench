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
import { SettingsRow } from './SettingsRow';

export interface SidebarEditionItemProps {
  readonly t: Translate;
}

export function SidebarEditionItem({ t }: SidebarEditionItemProps): JSX.Element {
  const [runtime, setRuntime] = useState<SidebarEdition>(runtimeSidebarEdition);
  const [applied, setApplied] = useState<SidebarEdition | null>(null);
  const [revision, setRevision] = useState(0);
  const snapshot = useApiResource<SidebarEditionSnapshot>(SIDEBAR_EDITION_ROUTE, {}, revision);
  const write = useHostWrite<SidebarEditionApplied>({
    channel: 'actions',
    resource: SIDEBAR_EDITION_RESOURCE,
    networkText: t('sidebarEdition.failed'),
  });
  const busy = useVisibleBusy(write.busy, MIN_BUSY_MS);
  const readFailed = snapshot.phase === 'error';
  const stored =
    snapshot.phase === 'ready' && snapshot.value !== undefined ? snapshot.value.edition : undefined;

  useEffect(() => subscribeSidebarEdition(() => setRuntime(runtimeSidebarEdition())), []);

  const choose = (next: SidebarEdition): void => {
    const previous = applied;
    setApplied(next);
    void write.send({ edition: next }).then((outcome) => {
      if (!outcome.ok) {
        setApplied(previous);
        return;
      }
      setApplied(outcome.value.edition);
      globalThis.location?.reload();
    });
  };

  const current: SidebarEdition = applied ?? stored ?? runtime;
  const description = busy.busy
    ? t('sidebarEdition.saving')
    : current === 'official'
      ? t('sidebarEdition.officialHint')
      : t('sidebarEdition.customHint');

  return (
    <SettingsRow
      title={t('sidebarEdition.nav')}
      description={description}
      error={write.failed ?? (readFailed ? t('workbenchSettings.readFailed') : null)}
      control={
        readFailed ? (
          <Button variant="ghost" size="sm" onClick={() => setRevision((value) => value + 1)}>
            {t('blocker.retry')}
          </Button>
        ) : (
          <SegmentedControl
            id="sidebar-edition"
            label={t('sidebarEdition.nav')}
            value={current}
            disabled={stored === undefined || busy.busy}
            onChange={choose}
            options={[
              { value: 'official', label: t('sidebarEdition.official') },
              { value: 'custom', label: t('sidebarEdition.custom') },
            ]}
          />
        )
      }
    />
  );
}
