import { join } from 'node:path';
import {
  ensureProfileBundle,
  removePath,
  tailLines,
  writeJsonFile,
  type ProcessHost,
} from '@dsh-workbench/shared/host';
import type {
  SelfUpdateExpectBootStep,
  SelfUpdateInstallStep,
  SelfUpdateStep,
  SelfUpdateSteps,
} from './self-update-steps.js';
import { bootVerdict, readBootRecord } from './self-update-boot.js';
import {
  carryPreviousVersion,
  flipProfileLinks,
  versionMissingOf,
  versionSelfCheck,
  writeProfileLinks,
  writeVersionProject,
  type VersionLink,
} from './version-dir.js';

export interface SelfUpdateRunDeps {
  readonly processes: ProcessHost;
  readonly now?: (() => string) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly flip?: ((links: readonly VersionLink[]) => void) | undefined;
  readonly inUseWaitMs?: number | undefined;
  readonly inUsePollMs?: number | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export const SELF_UPDATE_INUSE_WAIT_MS = 900_000;

export const SELF_UPDATE_INUSE_POLL_MS = 2_000;

export interface SelfUpdateRunResult {
  readonly ok: boolean;
  readonly state: 'ok' | 'pending' | 'failed';
  readonly detail: string;
  readonly ran: readonly string[];
}

interface StepOutcome {
  readonly ok: boolean;
  readonly detail: string;
  readonly marks?: 'flip' | undefined;
  readonly state?: SelfUpdateRunResult['state'] | undefined;
}

export async function runSelfUpdateSteps(
  plan: SelfUpdateSteps,
  deps: SelfUpdateRunDeps,
): Promise<SelfUpdateRunResult> {
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date().toISOString());
  const ran: string[] = [];
  let flippedAt = now();
  for (const step of plan.steps) {
    const outcome = await stepOutcome(plan, step, deps, now, log, flippedAt);
    if (outcome.marks === 'flip') flippedAt = now();
    if (!outcome.ok) {
      const manifest = holdBundles(plan);
      const detail = `${outcome.detail}；${manifest}`;
      writeJsonFile(plan.markerPath, {
        ...plan.marker,
        state: 'failed',
        version: plan.marker.from,
        reason: 'incomplete',
        at: now(),
      });
      log(detail);
      log(`救法：${plan.rescue}`);
      return { ok: false, state: 'failed', detail, ran };
    }
    ran.push(step.kind);
    log(outcome.detail);
    if (outcome.state === 'pending') return { ok: true, state: 'pending', detail: outcome.detail, ran };
    if (outcome.state === 'failed') return { ok: false, state: 'failed', detail: outcome.detail, ran };
  }
  return { ok: true, state: 'ok', detail: `${plan.version} 已就绪，重启后生效`, ran };
}

function holdBundles(plan: SelfUpdateSteps): string {
  const check = ensureProfileBundle(plan.profileDir, plan.bundle);
  if (check.refusal !== undefined) return `清单里那一行没能确认（${check.refusal}）—— 按下面那条救法做`;
  return check.repaired ? `清单里那一行缺了，已补回 ${plan.bundle}` : `清单里 ${plan.bundle} 那一行还在`;
}

async function stepOutcome(
  plan: SelfUpdateSteps,
  step: SelfUpdateStep,
  deps: SelfUpdateRunDeps,
  now: () => string,
  log: (message: string) => void,
  flippedAt: string,
): Promise<StepOutcome> {
  try {
    return await applyStep(plan, step, deps, now, log, flippedAt);
  } catch (error) {
    return { ok: false, detail: `${step.kind} 这一步抛了：${error instanceof Error ? error.message : String(error)}` };
  }
}

async function applyStep(
  plan: SelfUpdateSteps,
  step: SelfUpdateStep,
  deps: SelfUpdateRunDeps,
  now: () => string,
  log: (message: string) => void,
  flippedAt: string,
): Promise<StepOutcome> {
  if (step.kind === 'version') {
    writeVersionProject(step.project);
    return { ok: true, detail: `版本目录已铺好：${step.project.dir}` };
  }
  if (step.kind === 'install') {
    const first = await runCommand(step, deps);
    if (first.code !== 0) {
      return { ok: false, detail: `装这一版没成（退出码 ${first.code === null ? '拿不到' : String(first.code)}）：${tailLines(first.output, 8)}` };
    }
    const missing = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
    if (missing.length === 0) return { ok: true, detail: `装好了：${plan.version}` };
    log(`装完少了 ${String(missing.length)} 个包（${missing.join('、')}），清掉 node_modules 重装一遍`);
    removePath(join(plan.versionDir, 'node_modules'));
    const second = await runCommand(step, deps);
    const still = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
    if (second.code !== 0 || still.length > 0) {
      return {
        ok: false,
        detail: `装了两遍还是不全（${still.length > 0 ? still.join('、') : 'pnpm 退出码不对'}）：${tailLines(second.output, 6)}`,
      };
    }
    return { ok: true, detail: `重装一遍补齐了：${plan.version}` };
  }
  if (step.kind === 'verify') {
    const good = versionSelfCheck({ versionDir: step.versionDir, version: step.version, packages: step.packages });
    return good
      ? { ok: true, detail: '装完自检过了' }
      : { ok: false, detail: '装完自检没过：版本目录里的包或客户端产物不全' };
  }
  if (step.kind === 'switch') {
    const broken = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
    if (broken.length > 0) {
      return { ok: false, detail: `版本目录不全（${broken.join('、')}），不切过去：${plan.versionDir}` };
    }
    const flip = deps.flip ?? flipProfileLinks;
    const flipped = await waitOutInUse(
      () => {
        if (step.carry !== undefined) carryPreviousVersion({ profileDir: step.profileDir, ...step.carry });
        flip(step.links);
      },
      deps,
      now,
    );
    if (!flipped.ok) return { ok: false, detail: flipped.detail };
    writeProfileLinks({ profileDir: step.profileDir, links: step.links });
    return {
      ok: true,
      detail: flipped.waited
        ? `已经指到 ${plan.versionDir}（等你退出后换上的，重启生效）`
        : `已经指到 ${plan.versionDir}（重启后生效）`,
      marks: 'flip',
    };
  }
  if (step.kind === 'expect-boot') return expectBoot(plan, step, deps, now, flippedAt);
  if (step.kind === 'bundles') {
    const check = ensureProfileBundle(step.profileDir, step.bundle);
    if (check.refusal !== undefined) {
      return { ok: false, detail: `清单里那一行没法确认（${check.refusal}）：${check.path}` };
    }
    return check.repaired
      ? { ok: true, detail: `清单里缺了 ${step.bundle} 这一行，已经补回` }
      : { ok: true, detail: `清单里 ${step.bundle} 那一行一直都在` };
  }
  writeJsonFile(plan.markerPath, { ...plan.marker, state: step.state, version: step.version, at: now() });
  log(`marker 落 ${step.state}`);
  return { ok: true, detail: `${plan.version} 已就绪，重启后生效` };
}

function runCommand(step: SelfUpdateInstallStep, deps: SelfUpdateRunDeps): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    const done = (code: number | null): void => {
      if (settled) return;
      settled = true;
      resolve({ code, output });
    };
    const child = deps.processes.spawn({
      file: step.file,
      args: [...step.args],
      env: step.env,
      cwd: step.cwd,
      detached: false,
      stdio: 'pipe',
      windowsHide: true,
    });
    child.stdout?.onData((chunk) => {
      output += chunk;
    });
    child.stderr?.onData((chunk) => {
      output += chunk;
    });
    child.onError((error) => {
      output += `${output === '' ? '' : '\n'}${String(error)}`;
      done(null);
    });
    child.onExit((event) => {
      done(event.code);
    });
  });
}

async function expectBoot(
  plan: SelfUpdateSteps,
  step: SelfUpdateExpectBootStep,
  deps: SelfUpdateRunDeps,
  now: () => string,
  since: string,
): Promise<StepOutcome> {
  const { boot } = step;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.parse(now()) + boot.windowMs;
  for (;;) {
    const verdict = bootVerdict({
      target: boot.target,
      since,
      boot: readBootRecord(boot.file),
      up: readBootRecord(boot.upFile),
      now: now(),
    });
    if (verdict === 'confirmed') {
      writeJsonFile(plan.markerPath, { ...plan.marker, state: 'ok', version: boot.target, at: now() });
      return { ok: true, detail: `${boot.target} 起来了，这一版确认可用` };
    }
    if (Date.parse(now()) >= deadline) {
      return { ok: true, detail: `还没重启过，${boot.target} 先留着（重启后生效）`, state: 'pending' };
    }
    await sleep(boot.pollMs);
  }
}

const IN_USE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

function inUse(error: unknown): boolean {
  const code = (error as { readonly code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && IN_USE_CODES.has(code);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitOutInUse(
  run: () => void,
  deps: SelfUpdateRunDeps,
  now: () => string,
): Promise<{ readonly ok: true; readonly waited: boolean } | { readonly ok: false; readonly detail: string }> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.parse(now()) + (deps.inUseWaitMs ?? SELF_UPDATE_INUSE_WAIT_MS);
  let waited = false;
  for (;;) {
    try {
      run();
      return { ok: true, waited };
    } catch (error) {
      if (!inUse(error)) return { ok: false, detail: `翻链没成：${messageOf(error)}` };
      if (Date.parse(now()) >= deadline) {
        return {
          ok: false,
          detail: '换上这一版要先退出正在用的那个（Desktop 关掉就行），等到现在还没退出；退出后再点一次更新就好',
        };
      }
      waited = true;
      await sleep(deps.inUsePollMs ?? SELF_UPDATE_INUSE_POLL_MS);
    }
  }
}
