import type { DshHostContext } from '../api/dsh.js';
import type { DataReader } from '../contract/data.js';
import type { LibReader } from '../contract/lib.js';
import type { GitReader } from '../contract/git.js';
import type { CommandReader } from '../contract/command.js';
import type {
  EnvSupplyPort,
  HostActions,
  ModulePort,
  PluginSurface,
  ProbePort,
  ProfilePort,
  RuntimePort,
} from './port-types.js';

export const WORKBENCH_ADAPTERS = 'workbenchAdapters';

export const ADAPTER_SET_API_VERSION = 1;

export const SUPPORTED_ADAPTER_API_VERSIONS: readonly number[] = [ADAPTER_SET_API_VERSION];

export interface AdapterSet {
  readonly apiVersion: number;
  readonly id: string;
  readonly version: string;
  readonly data: DataReader;
  readonly libs?: LibReader | undefined;
  readonly git?: GitReader | undefined;
  readonly commands?: CommandReader | undefined;
  readonly supply: EnvSupplyPort;
  readonly modules: ModulePort;
  readonly profile: ProfilePort;
  readonly probe: ProbePort;
  readonly runtime: RuntimePort;
  readonly plugins: PluginSurface;
  readonly actions: HostActions;
}

export type CoreAdapterSet = Pick<
  AdapterSet,
  'apiVersion' | 'id' | 'version' | 'data' | 'supply' | 'profile' | 'probe'
>;

export type WorkbenchAdapters = AdapterSet;

export function adaptersOf(ctx: DshHostContext): AdapterSet {
  const adapters = ctx.get<AdapterSet>(WORKBENCH_ADAPTERS, false);
  if (adapters !== undefined) return adapters;
  throw new Error('workbenchAdapters 未提供');
}
