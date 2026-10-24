import type { DshHostContext } from '../api/dsh.js';
import { adaptersOf } from './adapters.js';
import type { SupplyPort } from './port-types.js';
export type { SupplyPort } from './port-types.js';


export function supplyPortOf(ctx: DshHostContext): SupplyPort {
  return adaptersOf(ctx).supply;
}

export function requireSupply(): SupplyPort {
  throw new Error('workbenchSupply 未提供');
}
