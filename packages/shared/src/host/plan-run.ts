import type { PluginPlanStep } from '../contract/plugin-source.js';
import { copyDirInto, ensureDir, linkDir, removePath } from './fs-write.js';
import type { ExecIntent } from './seam/exec.js';
import type { Seam } from './seam/run.js';
import { planStepText } from './shell-render.js';

export interface PlanRunDeps {
  readonly seam: Seam;
  readonly intent: ExecIntent;
  readonly timeoutMs?: number | undefined;
  readonly check?: ((step: PluginPlanStep) => void) | undefined;
}

/**
 * 安装计划里某一步没跑成：带上那条命令、退出码与输出，交给调用点做诊断。
 */
export class PlanStepError extends Error {
  readonly step: PluginPlanStep;
  readonly exitCode: number | null;
  readonly output: string;

  constructor(step: PluginPlanStep, exitCode: number | null, output: string) {
    super(`计划里这一步没跑成（退出码 ${exitCode === null ? '拿不到' : String(exitCode)}）：${planStepText(step)}`);
    this.name = 'PlanStepError';
    this.step = step;
    this.exitCode = exitCode;
    this.output = output;
  }
}

function applyFileStep(step: Exclude<PluginPlanStep, { readonly kind: 'run' }>): void {
  if (step.kind === 'remove') {
    removePath(step.path);
    return;
  }
  if (step.kind === 'mkdir') {
    ensureDir(step.path);
    return;
  }
  if (step.kind === 'link') {
    linkDir(step.target, step.path);
    return;
  }
  copyDirInto(step.from, step.to);
}

async function runCommandStep(step: Extract<PluginPlanStep, { readonly kind: 'run' }>, deps: PlanRunDeps): Promise<void> {
  const outcome = await deps.seam.run({
    command: step.line,
    intent: deps.intent,
    ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    ...(step.env === undefined ? {} : { env: step.env }),
  });
  if (step.optional === true) return;
  if (outcome.exitCode !== 0) throw new PlanStepError(step, outcome.exitCode, outcome.stderr || outcome.stdout);
}

/**
 * 按顺序跑完一个安装计划：命令走执行缝，文件操作走宿主文件入口（`node:fs`，不经过 shell）。
 * `optional` 只豁免「命令非零退出」，执行缝自己抛的错（沙箱拒绝一类）照旧冒出去。
 * @param steps - 计划步骤。
 * @param deps - 执行缝、写入域、超时，以及每一步的前置检查。
 * @returns 全部步骤完成。
 */
export async function runPlan(steps: readonly PluginPlanStep[], deps: PlanRunDeps): Promise<void> {
  for (const step of steps) {
    deps.check?.(step);
    if (step.kind === 'run') {
      await runCommandStep(step, deps);
      continue;
    }
    try {
      applyFileStep(step);
    } catch (error) {
      throw new PlanStepError(step, null, error instanceof Error ? error.message : String(error));
    }
  }
}
