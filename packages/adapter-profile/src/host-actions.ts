import { execa } from 'execa';
import { join } from 'node:path';
import type { HostActions, ProfileCreateDeps } from '@dsh-workbench/shared/host';
import {
  configSyncAction,
  configSyncHandler,
  profileCreateAction,
  profileCreateHandler,
} from '@dsh-workbench/shared/host';

const SETUP_TIMEOUT_MS = 10 * 60 * 1000;

export function runSetupAt(packageRoot: string, env: Readonly<Record<string, string>>): Promise<{ ok: boolean; log: string }> {
  const bin = join(packageRoot, 'bin', 'dsh-workbench');
  let log = '';
  const child = execa('bash', [bin, 'setup'], {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: SETUP_TIMEOUT_MS,
    reject: false,
    windowsHide: true,
  });
  const collect = (chunk: Buffer): void => {
    log = `${log}${chunk.toString('utf8')}`.slice(-20_000);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  return child.then(
    (result) => (result.timedOut === true ? { ok: false, log: `${log}\n创建超时` } : { ok: result.exitCode === 0, log }),
    (error: unknown) => ({ ok: false, log: `${log}\n${error instanceof Error ? error.message : String(error)}` }),
  );
}

export function createHostActions(): HostActions {
  return { configSyncAction, configSyncHandler, profileCreateAction, profileCreateHandler };
}

export function profileCreateDepsOf(deps: Omit<ProfileCreateDeps, 'runSetup'>): ProfileCreateDeps {
  return { ...deps, runSetup: (env) => runSetupAt(deps.packageRoot, env) };
}
