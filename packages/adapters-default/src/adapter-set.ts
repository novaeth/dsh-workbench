import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { AdapterSet, Seam } from '@dsh-workbench/shared/host';
import { ADAPTER_SET_API_VERSION, runningVersionOf, seamOf } from '@dsh-workbench/shared/host';
import {
  createCommandReader,
  createDataReader,
  createGitReader,
  createLibReader,
  opencliCommandOf,
  type QueueWaitEvent,
  type SaveBytesInput,
} from '@dsh-workbench/adapter-runtime';
import { dshPluginsHandler, profileDirOf } from '@dsh-workbench/adapter-supply';
import { createHostActions } from '@dsh-workbench/adapter-profile';
import { createProbePort, createSupplyPort, readSelfUpdateView } from '@dsh-workbench/adapter-probe';
import { createPluginSurface } from './plugin-surface.js';
import { createRuntimePort } from './runtime-port.js';

export const DEFAULT_ADAPTER_SET_ID = '@dsh-workbench/adapters-default';

interface HostAttachmentStore {
  saveFile?(input: { data: Uint8Array; mediaType?: string; name?: string }): Promise<unknown>;
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<unknown>;
}

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
  const attachments = ctx.get('attachments') as unknown as HostAttachmentStore | undefined;
  const saveBytes =
    attachments === undefined
      ? undefined
      : async (input: SaveBytesInput): Promise<unknown> => {
          const payload = { data: input.data, mediaType: input.contentType, name: input.name };
          const image = input.contentType.startsWith('image/');
          const first = image ? attachments.saveImage : attachments.saveFile;
          const second = image ? attachments.saveFile : attachments.saveImage;
          try {
            if (first !== undefined) return await first.call(attachments, payload);
          } catch (error) {
            if (second === undefined) throw error;
            return second.call(attachments, payload);
          }
          if (second !== undefined) return second.call(attachments, payload);
          throw new Error('宿主没有可用的附件服务');
        };
  const onQueue =
    logger?.info === undefined
      ? undefined
      : (event: QueueWaitEvent): void => {
          if (event.outcome === 'acquired' && event.waitedMs < 200) return;
          logger.info?.(`data ${event.session} ${event.outcome} after ${String(event.waitedMs)}ms`);
        };
  return {
    apiVersion: ADAPTER_SET_API_VERSION,
    id: DEFAULT_ADAPTER_SET_ID,
    version: runningVersionOf(import.meta.url) ?? '0.0.0',
    data: createDataReader({
      seam,
      command: opencli.command,
      ...(onQueue === undefined ? {} : { onQueue }),
      ...(saveBytes === undefined ? {} : { saveBytes }),
    }),
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
