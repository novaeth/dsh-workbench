import { createElement as h, useState } from 'react';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
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
import { SettingsRow } from './SettingsRow';

export type WorkbenchToggleField = 'mcpOnDemand' | 'includePrerelease';

export interface WorkbenchToggleItemProps {
  readonly field: WorkbenchToggleField;
  readonly title: string;
  readonly description: string;
  readonly failed: string;
}

export function WorkbenchToggleItem({
  field,
  title,
  description,
  failed,
}: WorkbenchToggleItemProps): JSX.Element {
  const snapshot = useApiResource<WorkbenchSettingsSnapshot>(WORKBENCH_SETTINGS_ROUTE, {}, 0);
  const write = useHostWrite<WorkbenchSettingsApplied>({
    channel: 'actions',
    resource: WORKBENCH_SETTINGS_RESOURCE,
    networkText: failed,
  });
  const busy = useVisibleBusy(write.busy, MIN_BUSY_MS);
  const [override, setOverride] = useState<boolean | null>(null);
  const stored =
    snapshot.phase === 'ready' && snapshot.value !== undefined
      ? snapshot.value.settings[field]
      : undefined;
  const checked = override ?? stored ?? false;

  const toggle = (next: boolean): void => {
    setOverride(next);
    void write.send({ [field]: next }).then((outcome) => {
      if (!outcome.ok) setOverride(null);
    });
  };

  return (
    <SettingsRow
      title={title}
      description={description}
      error={write.failed}
      control={
        <Switch
          checked={checked}
          disabled={stored === undefined || busy.busy}
          label={title}
          onChange={toggle}
        />
      }
    />
  );
}
