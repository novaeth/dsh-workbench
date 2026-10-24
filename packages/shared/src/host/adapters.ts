import type { DshHostContext } from '../api/dsh.js';
import type { DataReader } from '../contract/data.js';
import type { CliPort } from '../contract/cli.js';
import type { ProfilePort, SupplyPort } from './port-types.js';

export const WORKBENCH_ADAPTERS = 'workbenchAdapters';

export interface WorkbenchAdapters {
  readonly data: DataReader;
  readonly cli: CliPort;
  readonly profile: ProfilePort;
  readonly supply: SupplyPort;
}

export function adaptersOf(ctx: DshHostContext): WorkbenchAdapters {
  const adapters = ctx.get<WorkbenchAdapters>(WORKBENCH_ADAPTERS, false);
  if (adapters !== undefined) return adapters;
  throw new Error('workbenchAdapters 未提供');
}
