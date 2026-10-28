import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import type { AdapterSet } from '@dsh-workbench/shared/host';
import { ADAPTER_SET_API_VERSION, runningVersionOf } from '@dsh-workbench/shared/host';
import { createCommandReader, createDataReader, createGitReader, createLibReader, opencliCommandOf } from '@dsh-workbench/adapter-runtime';
import { dshPluginsHandler, profileDirOf } from '@dsh-workbench/adapter-supply';
import { createHostActions } from '@dsh-workbench/adapter-profile';
import { createProbePort, readSelfUpdateView } from '@dsh-workbench/adapter-probe';
import { createPluginSurface } from './plugin-surface.js';
import { createRuntimePort } from './runtime-port.js';
import { createSupplyPort } from './supply-port.js';

export const DEFAULT_ADAPTER_SET_ID = '@dsh-workbench/adapters-default';

export interface DefaultAdapterSetOptions {
  readonly shell?: DshShell | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

export function createAdapterSet(ctx: DshHostContext, options: DefaultAdapterSetOptions = {}): AdapterSet {
  const shell = options.shell ?? ctx.get<DshShell>('shell');
  const logger = options.logger ?? ctx.logger;
  const runtime = createRuntimePort();
  const opencli = opencliCommandOf(ctx);
  const supply = createSupplyPort();
  return {
    apiVersion: ADAPTER_SET_API_VERSION,
    id: DEFAULT_ADAPTER_SET_ID,
    version: runningVersionOf(import.meta.url) ?? '0.0.0',
    data: createDataReader({ shell, command: opencli.command }),
    libs: createLibReader(),
    ...(shell === undefined
      ? {}
      : {
          git: createGitReader({ shell, ...(logger === undefined ? {} : { logger }) }),
          commands: createCommandReader({ shell }),
        }),
    supply,
    modules: supply,
    profile: {
      dirOf: profileDirOf,
      dshPlugins: dshPluginsHandler,
      selfUpdateView: readSelfUpdateView,
    },
    probe: createProbePort(),
    runtime,
    plugins: createPluginSurface({
      shell,
      command: opencli.command,
      ...(logger === undefined ? {} : { logger }),
    }),
    actions: createHostActions(),
  };
}
