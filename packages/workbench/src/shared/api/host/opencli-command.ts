import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DshHomePath, DshHostContext } from '@dsh-workbench/shared';
import { isolatedInstallCommand, isolatedPnpmInstallCommand } from '@dsh-workbench/shared/host';
import { desktopPnpmPath, type PnpmProcess } from './toolchain';
import { opencliBinName } from './runtime-seed';

export type OpencliSource = 'env' | 'isolated' | 'path';

export interface OpencliResolution {
  readonly command: string;
  readonly source: OpencliSource;
  readonly isolated: string | null;
}

export const OPENCLI_PATH_FALLBACK = 'opencli';

export function isolatedOpencliPathOf(ctx: DshHostContext): string | null {
  const homePath = ctx.get<DshHomePath>('dshHomePath');
  if (typeof homePath !== 'function') return null;
  try {
    return join(homePath('workbench/opencli/bin'), opencliBinName());
  } catch {
    return null;
  }
}

export function opencliCommandOf(ctx: DshHostContext): OpencliResolution {
  const isolated = isolatedOpencliPathOf(ctx);
  const fromEnv = process.env.DSH_WORKBENCH_OPENCLI;
  if (fromEnv !== undefined && fromEnv !== '') return { command: fromEnv, source: 'env', isolated };
  if (isolated !== null && existsSync(isolated)) return { command: isolated, source: 'isolated', isolated };
  return { command: OPENCLI_PATH_FALLBACK, source: 'path', isolated };
}

export function opencliInstallCommand(
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
): string {
  const pnpm = desktopPnpmPath(proc, exists);
  return pnpm === undefined ? isolatedInstallCommand() : isolatedPnpmInstallCommand(pnpm);
}
