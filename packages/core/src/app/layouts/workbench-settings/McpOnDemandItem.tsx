import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS, Note } from '@dsh-workbench/shared';
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  WorkbenchSettingsApplied,
  WorkbenchSettingsSnapshot,
} from '@/kernel/contract/workbench-settings';
import {
  WORKBENCH_SETTINGS_RESOURCE,
  WORKBENCH_SETTINGS_ROUTE,
} from '@/kernel/contract/workbench-settings';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import { SettingsItem } from './SettingsItem';

export interface McpOnDemandItemProps {
  readonly t: Translate;
}

export function McpOnDemandItem({ t }: McpOnDemandItemProps): JSX.Element {
  const snapshot = useApiResource<WorkbenchSettingsSnapshot>(WORKBENCH_SETTINGS_ROUTE, {}, 0);
  const write = useHostWrite<WorkbenchSettingsApplied>({
    channel: 'actions',
    resource: WORKBENCH_SETTINGS_RESOURCE,
    networkText: t('mcpOnDemand.failed'),
  });
  const busy = useVisibleBusy(write.busy, MIN_BUSY_MS);
  const [override, setOverride] = useState<boolean | null>(null);
  const stored =
    snapshot.phase === 'ready' && snapshot.value !== undefined ? snapshot.value.settings.mcpOnDemand : undefined;
  const checked = override ?? stored ?? false;

  const toggle = (next: boolean): void => {
    setOverride(next);
    void write.send({ mcpOnDemand: next }).then((outcome) => {
      if (!outcome.ok) setOverride(null);
    });
  };

  return (
    <SettingsItem title={t('mcpOnDemand.nav')} description={t('mcpOnDemand.lead')}>
      <Checkbox
        checked={checked}
        disabled={stored === undefined || busy.busy}
        label={t('mcpOnDemand.toggle')}
        onChange={toggle}
      />
      {checked ? <Note>{t('mcpOnDemand.on')}</Note> : null}
    </SettingsItem>
  );
}
