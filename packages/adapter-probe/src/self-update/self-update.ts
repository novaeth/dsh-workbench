import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  acquireUpdateLease,
  now as clockNow,
  writeJsonFile,
  writeTextFile,
  type Seam,
  type SelfUpdatePaths,
  type SelfUpdateRequest,
  type SelfUpdateStart,
} from '@dsh-workbench/shared/host';
import { SELF_UPDATE_RUNNING_TTL_MS } from '@dsh-workbench/shared/contract/protocol/bundle-install';
import { hostSurface } from '../runtime/platform.js';
import { pidAlive } from './self-update-alive.js';
import { runDetached, type SeedCommand } from '../toolchain/runtime-seed.js';
import { selfUpdateCliFor, type SelfUpdateProcess } from './self-update-cli.js';
import {
  recoveryCommand,
  selfUpdateMarker,
  selfUpdatePaths,
  selfUpdateRequestProblem,
  type SelfUpdateMarker,
} from './self-update-plan.js';
import { selfUpdateStepsOf, type SelfUpdateSteps } from './self-update-steps.js';

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
  readonly leaseToken?: string | undefined;
  readonly requesterPid?: number | undefined;
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
      env: {
        ...(hostSurface().runtime === 'electron' ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        ...(options.leaseToken === undefined || options.leaseToken === ''
          ? {}
          : { DSH_WB_UPDATE_LEASE_TOKEN: options.leaseToken }),
        ...(request.profile === '' ? {} : { DSH_WB_DIAG_PROFILE: request.profile }),
        DSH_WB_DIAG_DEPLOYMENT: hostSurface().deployment,
      },
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
  const paths = selfUpdatePaths();
  const forward = recoveryCommand({
    profile: request.profile,
    pkg: request.pkg,
    version: request.to === '' ? 'latest' : request.to,
    cli: selfUpdateCliFor(request.profile, options.proc, options.exists),
  });
  const problem = selfUpdateRequestProblem(request);
  if (problem !== undefined) {
    onError(problem);
    return { started: false, paths, forward };
  }
  if (selfUpdateBusy(paths.marker)) {
    onError('已经有一次工作台更新在运行 —— 等它结束再试。');
    return { started: false, paths, forward };
  }
  let lease;
  try {
    lease = acquireUpdateLease({ root: paths.dir });
  } catch (error) {
    onError(`更新锁没写上，这次先不更新：${String(error)}`);
    return { started: false, paths, forward };
  }
  if (lease === undefined) {
    onError('已经有一次工作台更新在运行 —— 等它结束再试。');
    return { started: false, paths, forward };
  }
  let plan: SelfUpdatePlan;
  try {
    plan = planSelfUpdate(request, new Date(clockNow()), {
      ...options,
      leaseToken: lease.record.token,
      requesterPid: process.pid,
    });
    mkdirSync(plan.paths.dir, { recursive: true });
    writeTextFile(plan.planFile, `${JSON.stringify(plan.steps, null, 2)}\n`);
    writeJsonFile(plan.paths.marker, plan.marker);
  } catch (error) {
    lease.release();
    onError(`更新计划没写成，这次先不更新：${String(error)}`);
    return { started: false, paths, forward };
  }
  if (!runDetached(plan.command, onError, seam)) {
    lease.release();
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
