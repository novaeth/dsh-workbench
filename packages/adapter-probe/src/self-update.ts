import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { now as clockNow, writeJsonFile, writeTextFile } from '@dsh-workbench/shared/host';
import type { Seam, SelfUpdatePaths, SelfUpdateRequest, SelfUpdateStart } from '@dsh-workbench/shared/host';
import { SELF_UPDATE_RUNNING_TTL_MS } from '@dsh-workbench/shared/contract/protocol/bundle-install';
import { hostSurface } from './platform.js';
import { runDetached, type SeedCommand } from './runtime-seed.js';
import { type SelfUpdateProcess } from './self-update-cli.js';
import { selfUpdateMarker, selfUpdatePaths, type SelfUpdateMarker } from './self-update-plan.js';
import { selfUpdateStepsOf, type SelfUpdateSteps } from './self-update-steps.js';

export * from './self-update-cli.js';
export * from './self-update-plan.js';
export * from './self-update-steps.js';
export * from './self-update-view.js';

export { SELF_UPDATE_RUNNING_TTL_MS } from '@dsh-workbench/shared/contract/protocol/bundle-install';

export { runningVersionOf } from '@dsh-workbench/shared/host';

export interface SelfUpdatePlan {
  readonly paths: SelfUpdatePaths;
  readonly steps: SelfUpdateSteps;
  readonly planFile: string;
  readonly marker: SelfUpdateMarker;
  readonly command: SeedCommand;
}

export interface SelfUpdatePlanOptions {
  readonly proc?: SelfUpdateProcess | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
}

function pidAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function selfUpdateBusy(marker: string, at: Date = new Date(clockNow())): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(marker, 'utf8'));
  } catch {
    return false;
  }
  if (typeof raw !== 'object' || raw === null) return false;
  const record = raw as Readonly<Record<string, unknown>>;
  if (record.state === 'queued') return pidAlive(record.pid);
  if (record.state !== 'running') return false;
  if (typeof record.pid === 'number') return pidAlive(record.pid);
  const started = typeof record.at === 'string' ? Date.parse(record.at) : Number.NaN;
  if (!Number.isFinite(started)) return true;
  return at.getTime() - started < SELF_UPDATE_RUNNING_TTL_MS;
}

export function selfUpdateRunnerEntry(): string {
  return fileURLToPath(new URL('./self-update-runner.js', import.meta.url));
}

export function planSelfUpdate(
  request: SelfUpdateRequest,
  now: Date = new Date(clockNow()),
  options: SelfUpdatePlanOptions = {},
): SelfUpdatePlan {
  const paths = selfUpdatePaths();
  const steps = selfUpdateStepsOf(request, paths, { ...options, at: now.toISOString() });
  return {
    paths,
    steps,
    planFile: paths.planFile,
    marker: selfUpdateMarker(request, 'running', request.from, now.toISOString(), steps.migration),
    command: {
      file: process.execPath,
      args: [selfUpdateRunnerEntry(), paths.planFile],
      env: hostSurface().runtime === 'electron' ? { ELECTRON_RUN_AS_NODE: '1' } : {},
      log: paths.log,
    },
  };
}

export function startSelfUpdate(
  request: SelfUpdateRequest,
  onError: (message: string) => void,
  seam?: Seam | undefined,
  options: SelfUpdatePlanOptions = {},
): SelfUpdateStart {
  const plan = planSelfUpdate(request, new Date(clockNow()), options);
  const forward = plan.steps.rescue;
  if (selfUpdateBusy(plan.paths.marker)) {
    onError('已经有一次工作台更新在跑 —— 等它落定再试（self-update.json 会说它到哪一步了）。');
    return { started: false, paths: plan.paths, forward };
  }
  mkdirSync(plan.paths.dir, { recursive: true });
  writeTextFile(plan.planFile, `${JSON.stringify(plan.steps, null, 2)}\n`);
  writeJsonFile(plan.paths.marker, plan.marker);
  if (!runDetached(plan.command, onError, seam)) {
    writeJsonFile(plan.paths.marker, {
      ...plan.marker,
      state: 'failed',
      version: plan.marker.from,
      reason: 'incomplete',
      at: new Date(clockNow()).toISOString(),
    });
    return { started: false, paths: plan.paths, forward };
  }
  return { started: true, paths: plan.paths, forward };
}
