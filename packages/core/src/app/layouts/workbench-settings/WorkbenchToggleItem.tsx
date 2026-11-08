import { createElement as h, useState } from 'react';
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

export type WorkbenchToggleField = 'mcpOnDemand' | 'includePrerelease';

export interface WorkbenchToggleItemProps {
  readonly field: WorkbenchToggleField;
  readonly title: string;
  readonly description: string;
  readonly label: string;
  readonly note: string;
  readonly failed: string;
}

export function WorkbenchToggleItem({
  field,
  title,
  description,
  label,
  note,
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
    <SettingsItem title={title} description={description}>
      <Checkbox checked={checked} disabled={stored === undefined || busy.busy} label={label} onChange={toggle} />
      {checked ? <Note>{note}</Note> : null}
      {write.failed === null ? null : (
        <Note tone="problem" role="alert">
          {write.failed}
        </Note>
      )}
    </SettingsItem>
  );
}
