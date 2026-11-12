import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { AdapterSet, Seam } from '@dsh-workbench/shared/host';
import { ADAPTER_SET_API_VERSION, runningVersionOf, seamOf } from '@dsh-workbench/shared/host';
import { createCommandReader, createDataReader, createGitReader, createLibReader, opencliCommandOf } from '@dsh-workbench/adapter-runtime';
import { dshPluginsHandler, profileDirOf } from '@dsh-workbench/adapter-supply';
import { createHostActions } from '@dsh-workbench/adapter-profile';
import { createProbePort, createSupplyPort, readSelfUpdateView } from '@dsh-workbench/adapter-probe';
import { createPluginSurface } from './plugin-surface.js';
import { createRuntimePort } from './runtime-port.js';

export const DEFAULT_ADAPTER_SET_ID = '@dsh-workbench/adapters-default';

export interface DefaultAdapterSetOptions {
  readonly seam?: Seam | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

export function createAdapterSet(ctx: DshHostContext, options: DefaultAdapterSetOptions = {}): AdapterSet {
  const seam = options.seam ?? seamOf(ctx);
  const logger = options.logger ?? ctx.logger;
  const runtime = createRuntimePort();
  const opencli = opencliCommandOf(ctx);
  const supply = createSupplyPort(seam === undefined ? {} : { seam });
  return {
    apiVersion: ADAPTER_SET_API_VERSION,
    id: DEFAULT_ADAPTER_SET_ID,
    version: runningVersionOf(import.meta.url) ?? '0.0.0',
    data: createDataReader({ seam, command: opencli.command }),
    libs: createLibReader(),
    ...(seam === undefined
      ? {}
      : {
          git: createGitReader({ seam, ...(logger === undefined ? {} : { logger }) }),
          commands: createCommandReader({ seam }),
        }),
    supply,
    modules: supply,
    profile: {
      dirOf: profileDirOf,
      dshPlugins: dshPluginsHandler,
      selfUpdateView: (profile: string) => readSelfUpdateView(profile),
    },
    probe: createProbePort(),
    runtime,
    plugins: createPluginSurface({
      seam,
      command: opencli.command,
      ...(logger === undefined ? {} : { logger }),
    }),
    actions: createHostActions(),
  };
}
