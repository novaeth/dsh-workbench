import type { DshClientContext } from '@dsh-workbench/shared';
import { LOCALE_NS } from '@dsh-workbench/shared';
import { DebugFooterAction } from './DebugFooterAction';

export const DEBUG_FOOTER_ID = 'workbench-debug';
export const DEBUG_FOOTER_ORDER = 10;

export function registerDebugFooter(ctx: DshClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: DEBUG_FOOTER_ID,
        order: DEBUG_FOOTER_ORDER,
        locale: LOCALE_NS,
      },
      DebugFooterAction,
    ),
  );
}
