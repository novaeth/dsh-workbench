import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeLayoutOf } from '@dsh-workbench/shared/host';
import { OPENCLI_RUNTIME_ID } from '../foundation/paths.js';

export type OpencliSource = 'env' | 'isolated' | 'path';

export interface HostContextLike {
  get<T = unknown>(name: string): T | undefined;
}

export interface OpencliResolution {
  readonly command: string;
  readonly source: OpencliSource;
  readonly isolated: string | null;
}

export const OPENCLI_PATH_FALLBACK = 'opencli';

function binName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'opencli.cmd' : 'opencli';
}

export function isolatedOpencliPathOf(_ctx: HostContextLike): string | null {
  return join(runtimeLayoutOf(OPENCLI_RUNTIME_ID).root, 'bin', binName());
}

export function opencliCommandOf(ctx: HostContextLike): OpencliResolution {
  const isolated = isolatedOpencliPathOf(ctx);
  const fromEnv = process.env.DSH_WORKBENCH_OPENCLI;
  if (fromEnv !== undefined && fromEnv !== '') return { command: fromEnv, source: 'env', isolated };
  if (isolated !== null && existsSync(isolated)) return { command: isolated, source: 'isolated', isolated };
  return { command: OPENCLI_PATH_FALLBACK, source: 'path', isolated };
}
export * from './opencli.js';
export * from './opencli-runtime.js';
export * from './opencli-window.js';
export * from './opencli-types.js';
