import type { DataError, PlanResults, RequestPlan } from '../../contract/data.js';
import { planProblemOf } from '../data-plan.js';
import { withLoginRetry } from './login-retry.js';
import type { FlowAction, FlowActionContext, FlowDataPort, FlowDataStep } from './types.js';

class DataStepError extends Error {
  readonly step: string;
  readonly code: DataError['code'];
  readonly pageCode?: string;
  readonly hint?: string;
  readonly helpUrl?: string;

  constructor(step: string, error: DataError, notRun: readonly string[] = []) {
    const what = error.code === 'permission-denied' ? `没有权限读这一步：${error.message}` : error.message;
    super(`第 ${step} 跳没成（${error.code}）：${what}${notRun.length === 0 ? '' : `；后面 ${notRun.join(' / ')} 没跑`}`);
    this.name = 'DataStepError';
    this.step = step;
    this.code = error.code;
    this.pageCode = error.pageCode;
    this.hint = error.hint;
    this.helpUrl = error.helpUrl;
  }
}

function planFailureOf(
  outcome: PlanResults,
  plan: RequestPlan,
): { readonly step: string; readonly error: DataStepError } | undefined {
  for (const [index, step] of plan.steps.entries()) {
    const notRun = plan.steps.slice(index + 1).map((one) => one.name);
    const one = outcome[step.name];
    if (one === undefined) {
      return {
        step: step.name,
        error: new DataStepError(
          step.name,
          { code: 'parse', message: '这一步没有结果', pageCode: 'missing' },
          notRun,
        ),
      };
    }
    if (!one.ok) return { step: step.name, error: new DataStepError(step.name, one.error, notRun) };
  }
  return undefined;
}

function flattenPlanResults(outcome: PlanResults, plan: RequestPlan): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const step of plan.steps) {
    const one = outcome[step.name];
    if (one?.ok === true) out[step.name] = one.data;
  }
  return out;
}

function timingTextOf(outcome: PlanResults, plan: RequestPlan): string | undefined {
  const parts: string[] = [];
  let total = 0;
  let measured = 0;
  for (const step of plan.steps) {
    const elapsed = outcome[step.name]?.elapsedMs;
    if (elapsed === undefined) continue;
    measured += 1;
    total += elapsed;
    parts.push(`${step.name} ${String(Math.round(elapsed))}ms`);
  }
  if (measured === 0) return undefined;
  return `读数据：${String(measured)} 跳 ${String(Math.round(total))}ms（${parts.join(' / ')}）`;
}

function announceAuth(url: string, error: unknown, context: FlowActionContext): void {
  context.need({
    title: '需要登录',
    ...(error instanceof Error && error.message !== '' ? { hint: error.message } : {}),
    actions: [{ kind: 'open-url', url }],
  });
}

/** 把一份内联 `RequestPlan` 做成 flow 的合成动作；外层再用 `withLoginRetry` 包住 auth。 */
export function dataActionOf(
  step: FlowDataStep,
  data: FlowDataPort | undefined,
  options: { readonly sleep?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined } = {},
): FlowAction {
  const action: FlowAction = async (_input, context) => {
    if (data === undefined) throw new Error('这一步要读数据，但这一趟没有数据通道');
    const problem = planProblemOf(step.data)[0];
    if (problem !== undefined) {
      throw new DataStepError(problem.path, { code: 'invalid-request', message: problem.problem });
    }
    const outcome = await data.plan(step.data, { signal: context.signal, open: step.open ?? true });
    if (context.signal.aborted) {
      const error = new Error('流程已停止');
      error.name = 'AbortError';
      throw error;
    }
    const failure = planFailureOf(outcome, step.data);
    if (failure !== undefined) throw failure.error;
    const summary = timingTextOf(outcome, step.data);
    if (summary !== undefined) context.log(summary);
    return flattenPlanResults(outcome, step.data);
  };
  return withLoginRetry(action, {
    announce: announceAuth,
    isAuthError: (error) =>
      error instanceof DataStepError && error.code === 'auth' && error.helpUrl !== undefined,
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
  });
}
