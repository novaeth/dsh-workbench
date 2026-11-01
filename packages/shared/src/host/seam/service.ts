import type { DshHostContext } from '../../api/dsh.js';
import type { Seam } from './run.js';

export const WORKBENCH_SEAM = 'workbenchSeam';

export function seamOf(ctx: DshHostContext): Seam | undefined {
  return ctx.get<Seam>(WORKBENCH_SEAM, false);
}
