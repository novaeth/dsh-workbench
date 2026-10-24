import type { DshHostContext } from '../api/dsh.js';
import { adaptersOf } from './adapters.js';
import type { ProfilePort } from './port-types.js';
export type { ProfilePort } from './port-types.js';


export function profilePortOf(ctx: DshHostContext): ProfilePort {
  return adaptersOf(ctx).profile;
}
