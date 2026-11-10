import { join } from 'node:path';
import type { Seam } from '@dsh-workbench/shared/host';
import { workbenchRoot } from '@dsh-workbench/shared/host';
import type { RestartWorkbenchStart } from '@dsh-workbench/shared/host';
import { hostSurface } from './platform.js';
import { runDetached, type SeedCommand } from './runtime-seed.js';
import type { SelfUpdateProcess } from './self-update-cli.js';
import { selfUpdatePaths } from './self-update-plan.js';
import { selfUpdateBusy } from './self-update.js';

export interface RestartWorkbenchOptions {
  readonly seam?: Seam | undefined;
  readonly proc?: SelfUpdateProcess | undefined;
  readonly onError?: ((message: string) => void) | undefined;
  readonly busy?: boolean | undefined;
  readonly exit?: (() => void) | undefined;
}

export interface RestartWorkbenchResult extends RestartWorkbenchStart {
  readonly command?: SeedCommand | undefined;
}

export function restartCommand(proc: SelfUpdateProcess = process): SeedCommand | undefined {
  const entry = proc.argv[1];
  if (entry === undefined || entry === '') return undefined;
  return {
    file: proc.execPath,
    args: [entry, ...proc.argv.slice(2)],
    env: {},
    log: join(workbenchRoot(), 'restart.log'),
  };
}

export function restartWorkbench(options: RestartWorkbenchOptions = {}): RestartWorkbenchResult {
  const proc = options.proc ?? process;
  const busy = options.busy ?? selfUpdateBusy(selfUpdatePaths().marker);
  if (busy) return { started: false, refusal: 'update-running' };
  if (hostSurface({ proc }).deployment === 'desktop') {
    return { started: false, refusal: 'desktop-manual' };
  }
  const command = restartCommand(proc);
  if (command === undefined) return { started: false, refusal: 'no-entry' };
  const started = runDetached(command, options.onError ?? (() => undefined), options.seam, {
    label: 'restart',
    what: '重启',
  });
  if (!started) return { started: false, refusal: 'no-seam', command };
  (options.exit ?? ((): void => process.exit(0)))();
  return { started: true, command };
}
