import type {
  DataFailure,
  PlanResults,
  PlanStep,
  PlanStepResult,
  RequestPlan,
  SubmitPlanOptions,
} from '@dsh-workbench/shared/host';
import { allSame, planProblemOf, planResultsOf, scriptOfPlan } from '@dsh-workbench/shared/host';
import { attachOf } from './attachment.js';
import { failure } from './result.js';
import type { SaveBytes } from './types.js';

const MAX_PRIOR_BYTES = 128_000;

export type SubmitRun = (script: string) => Promise<{ readonly ok: true; readonly value: unknown } | DataFailure>;

function invalid(plan: RequestPlan, message: string): PlanResults {
  return allSame(plan, { code: 'invalid-request', message });
}

function hasOwnIdempotencyKey(step: PlanStep): boolean {
  const headers = step.request.headers ?? {};
  return Object.keys(headers).some((one) => one.toLowerCase() === 'idempotency-key');
}

function idempotent(step: PlanStep, key: string): PlanStep {
  const headers = step.request.headers ?? {};
  if (Object.keys(headers).some((name) => name.toLowerCase() === 'idempotency-key')) return step;
  return {
    ...step,
    request: {
      ...step.request,
      headers: { ...headers, 'Idempotency-Key': `${key}:${step.name}` },
    },
  };
}

function confirmWithAbort(
  confirm: SubmitPlanOptions['confirm'],
  step: PlanStep,
  index: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal === undefined) return Promise.resolve(confirm(step, index));
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const settle = (value: boolean, error?: unknown): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (error === undefined) resolve(value);
      else reject(error);
    };
    const onAbort = (): void => {
      settle(false);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => confirm(step, index))
      .then(
        (value) => {
          settle(value);
        },
        (error: unknown) => {
          settle(false, error);
        },
      )
      .catch(() => {});
  });
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function skipped(step: PlanStep, message: string, pageCode = 'skipped'): PlanStepResult<unknown> {
  return { ok: false, error: { code: 'skipped', message, pageCode } };
}

export async function submitPlanOf(
  plan: RequestPlan,
  options: SubmitPlanOptions,
  run: SubmitRun,
  saveBytes?: SaveBytes | undefined,
): Promise<PlanResults> {
  if (options.idempotencyKey.trim() === '') return invalid(plan, 'submitPlan 要一个非空的幂等键');
  const problem = planProblemOf(plan)[0];
  if (problem !== undefined) return invalid(plan, `${problem.path}: ${problem.problem}`);
  for (const step of plan.steps) {
    if (step.request.method === 'GET') return invalid(plan, `第 ${step.name} 步是 GET：写计划只收写请求`);
    if (hasOwnIdempotencyKey(step)) {
      return invalid(plan, `第 ${step.name} 步自己带了 Idempotency-Key：交给 submitPlan 的 idempotencyKey 统一加`);
    }
    if (step.repeat !== undefined || step.while !== undefined) {
      return invalid(plan, `第 ${step.name} 步带分页：写计划不支持分页`);
    }
  }

  const out: Record<string, PlanStepResult<unknown>> = Object.create(null) as Record<string, PlanStepResult<unknown>>;
  const done: Record<string, unknown> = {};
  for (const [index, step] of plan.steps.entries()) {
    if (isAborted(options.signal)) {
      out[step.name] = failure('aborted', '已停止', { pageCode: 'aborted' });
      break;
    }
    const priorTooLarge =
      Buffer.byteLength(JSON.stringify(Object.fromEntries(Object.entries(done).map(([name, value]) => [name, { value }]))), 'utf8') >
      MAX_PRIOR_BYTES;
    if (priorTooLarge) {
      out[step.name] = failure(
        'invalid-request',
        `前面几步的结果带不进这一步（超过 ${String(MAX_PRIOR_BYTES)} 字节）：把大字段留到最后一步`,
        { pageCode: 'prior-too-large' },
      );
      break;
    }
    let confirmed: boolean;
    try {
      confirmed = await confirmWithAbort(options.confirm, step, index, options.signal);
    } catch (error) {
      out[step.name] = failure('invalid-request', `确认失败：${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    if (!confirmed) {
      out[step.name] = isAborted(options.signal)
        ? failure('aborted', '已停止', { pageCode: 'aborted' })
        : skipped(step, '没有确认，没有写', 'declined');
      break;
    }

    const partial: RequestPlan = {
      ...plan,
      steps: plan.steps.slice(0, index + 1).map((one) => idempotent(one, options.idempotencyKey)),
    };
    const prior = Object.fromEntries(Object.entries(done).map(([name, value]) => [name, { value }]));
    let script: string;
    try {
      script = scriptOfPlan(partial, prior);
    } catch (error) {
      out[step.name] = failure('invalid-request', error instanceof Error ? error.message : String(error));
      break;
    }
    const ran = await run(script);
    if (!ran.ok) {
      out[step.name] = ran;
      break;
    }
    const page = planResultsOf(ran.value, partial.steps.map((one) => one.name), {
      ...(plan.loginUrl === undefined ? {} : { loginUrl: plan.loginUrl }),
    });
    const got = page[step.name];
    if (got === undefined) {
      out[step.name] = failure('parse', '这一步没有结果');
      break;
    }
    const final = step.response?.saveAs === 'attachment' ? await attachOf(step, got, saveBytes) : got;
    out[step.name] = final;
    try {
      options.onStep?.(step, index, final);
    } catch {
    }
    if (!final.ok) break;
    done[step.name] = final.data;
  }

  for (const step of plan.steps) {
    if (out[step.name] !== undefined) continue;
    out[step.name] = skipped(step, '前面没有完成，没有写');
  }
  return out;
}
