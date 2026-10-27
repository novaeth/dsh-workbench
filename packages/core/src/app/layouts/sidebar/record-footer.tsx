import type { DshClientContext } from '@dsh-workbench/shared';
import { LOCALE_NS } from '@dsh-workbench/shared';
import { RecordFooterAction } from './RecordFooterAction';

export const RECORD_FOOTER_ID = 'workbench-record';
export const RECORD_FOOTER_ORDER = 11;

export function registerRecordFooter(ctx: DshClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: RECORD_FOOTER_ID,
        order: RECORD_FOOTER_ORDER,
        locale: LOCALE_NS,
      },
      RecordFooterAction,
    ),
  );
}
