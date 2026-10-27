import type { DshHomePath, DshHostContext } from '@dsh-workbench/shared';
import { WORKSHOP_RELATIVE } from '@/kernel/contract/diy';

export function workshopPathOf(ctx: DshHostContext): string | null {
  const homePath = ctx.get<DshHomePath>('dshHomePath');
  if (typeof homePath !== 'function') return null;
  try {
    return homePath(WORKSHOP_RELATIVE);
  } catch {
    return null;
  }
}
