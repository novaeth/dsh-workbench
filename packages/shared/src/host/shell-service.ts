import type { DshHostContext, DshShell } from '../api/dsh.js';

export const WORKBENCH_SHELL = 'workbenchShell';

export function shellOf(ctx: DshHostContext): DshShell | undefined {
  return ctx.get<DshShell>(WORKBENCH_SHELL, false) ?? ctx.get<DshShell>('shell');
}
