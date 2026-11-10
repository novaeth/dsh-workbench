import type { DshHostContext } from '@dsh-workbench/shared';
import type { ModulePort } from '@dsh-workbench/shared/host';
import { nowIso, runningVersionOf, workbenchBootFile, writeBootRecord } from '@dsh-workbench/shared/host';
import { resumeQueuedSelfUpdate } from './self-update-resume';

export interface BootChoresInput {
  readonly ctx: DshHostContext;
  readonly supply: Pick<ModulePort, 'startSelfUpdate'> | undefined;
  readonly home: string;
  readonly profileDir: string | null;
  readonly version?: string | undefined;
}

export function bootChores(input: BootChoresInput): string | undefined {
  const version = input.version ?? runningVersionOf(import.meta.url);
  if (version !== undefined) {
    writeBootRecord({ version, at: nowIso(), pid: process.pid }, workbenchBootFile());
  }
  resumeQueuedSelfUpdate(input.ctx, { supply: input.supply, home: input.home, profileDir: input.profileDir });
  return version;
}
