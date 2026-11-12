import { LOCALE_NS } from '@dsh-workbench/shared';
import type { DshClientContext } from '@dsh-workbench/shared';
import { WorkbenchSettingsIcon } from './WorkbenchSettingsIcon';
import { WorkbenchSettingsSection } from './WorkbenchSettingsSection';

const WORKBENCH_SETTINGS_SECTION_ID = 'workbench-settings';

export function registerWorkbenchSettings(ctx: DshClientContext): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: WORKBENCH_SETTINGS_SECTION_ID,
        order: 40,
        locale: LOCALE_NS,
        label: () => ctx.locale.bind(LOCALE_NS)('workbenchSettings.nav'),
        inject: () => ({ t: ctx.locale.bind(LOCALE_NS) }),
      },
      WorkbenchSettingsSection,
    ),
  );
  ctx.slots.inject('settings.section.icon', () =>
    ctx.slots.register(
      {
        name: 'settings.section.icon',
        id: WORKBENCH_SETTINGS_SECTION_ID,
      },
      WorkbenchSettingsIcon,
    ),
  );
}
