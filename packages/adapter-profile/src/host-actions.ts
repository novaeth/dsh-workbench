import { join } from 'node:path';
import type { HostActions, ProfileCreateDeps, Seam } from '@dsh-workbench/shared/host';
import {
  configSyncAction,
  configSyncHandler,
  profileCreateAction,
  profileCreateHandler,
} from '@dsh-workbench/shared/host';

const SETUP_TIMEOUT_MS = 10 * 60 * 1000;
const LOG_TAIL_CHARS = 20_000;

function tailOf(stdout: string, stderr: string): string {
  return `${stdout}${stderr}`.slice(-LOG_TAIL_CHARS);
}

export async function runSetupAt(
  seam: Seam,
  packageRoot: string,
  env: Readonly<Record<string, string>>,
): Promise<{ ok: boolean; log: string }> {
  const bin = join(packageRoot, 'bin', 'dsh-workbench');
  try {
    const outcome = await seam.run({
      argv: ['bash', bin, 'setup'],
      intent: { kind: 'host' },
      workdir: packageRoot,
      env,
      timeoutMs: SETUP_TIMEOUT_MS,
    });
    const log = tailOf(outcome.stdout, outcome.stderr);
    return outcome.timedOut ? { ok: false, log: `${log}\n创建超时` } : { ok: outcome.exitCode === 0, log };
  } catch (error) {
    return { ok: false, log: `\n${error instanceof Error ? error.message : String(error)}` };
  }
}

export function createHostActions(): HostActions {
  return { configSyncAction, configSyncHandler, profileCreateAction, profileCreateHandler };
}

export function profileCreateDepsOf(
  seam: Seam,
  deps: Omit<ProfileCreateDeps, 'runSetup'>,
): ProfileCreateDeps {
  return { ...deps, runSetup: (env) => runSetupAt(seam, deps.packageRoot, env) };
}
