import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { WorkbenchToggleItem } from './WorkbenchToggleItem';

export interface UpdatePrereleaseItemProps {
  readonly t: Translate;
}

export function UpdatePrereleaseItem({ t }: UpdatePrereleaseItemProps): JSX.Element {
  return (
    <WorkbenchToggleItem
      field="includePrerelease"
      title={t('updatePrerelease.nav')}
      description={t('updatePrerelease.lead')}
      label={t('updatePrerelease.toggle')}
      note={t('updatePrerelease.on')}
      failed={t('updatePrerelease.failed')}
    />
  );
}
