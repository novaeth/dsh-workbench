import { now as clockNow } from '../time.js';
import { agentStopReasonText, agentSummaryOf } from './agent.js';
import { evalPredicate, resolveInput, resolveValue } from './expr.js';
import type {
  FlowAction,
  FlowActionContext,
  FlowActionRegistry,
  FlowActionStep,
  FlowAgentRequest,
  FlowAgentRunner,
  FlowAgentStep,
  FlowDefinition,
  FlowResult,
  FlowRunOptions,
  FlowRetry,
  FlowScope,
  FlowStepEvent,
  RegisteredFlowAction,
} from './types.js';

type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

class StepFailure extends Error {
  readonly stepId: string;

  constructor(stepId: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'StepFailure';
    this.stepId = stepId;
    this.cause = cause;
  }
}

function abortError(): Error {
  const error = new Error('流程已停止');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function targetOf(flow: FlowDefinition, scope: FlowScope): string {
  if (flow.target === undefined) return flow.id;
  const value = resolveValue(flow.target, scope);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : flow.id;
}

function stopped(steps: Readonly<Record<string, unknown>>, target: string): FlowResult {
  return { status: 'stopped', target, steps };
}

/**
 * 建一个内存里的动作注册表；每个流程运行时各有一份，没有模块级状态。
 * @returns 注册表。
 */
export function createFlowActionRegistry(): FlowActionRegistry {
  const entries = new Map<string, RegisteredFlowAction>();
  return {
    register(name, action, meta) {
      const trimmed = name.trim();
      if (trimmed === '') throw new Error('动作名不能为空');
      entries.set(trimmed, { name: trimmed, action, meta: meta ?? {} });
    },
    get(name) {
      return entries.get(name);
    },
    has(name) {
      return entries.has(name);
    },
    list() {
      return [...entries.values()];
    },
  };
}

async function callWithRetry(
  action: FlowAction,
  input: unknown,
  context: FlowActionContext,
  retry: FlowRetry | undefined,
  sleep: Sleep,
  signal: AbortSignal,
  onAttempt?: (attempt: number) => void,
): Promise<unknown> {
  const attempts = Math.max(0, Math.min(5, Math.trunc(retry?.attempts ?? 0)));
  const delayMs = Math.max(0, Math.min(60_000, Math.trunc(retry?.delayMs ?? 0)));
  let last: unknown;
  for (let attempt = 1; attempt <= attempts + 1; attempt += 1) {
    if (signal.aborted) throw abortError();
    onAttempt?.(attempt);
    try {
      return await action(input, context);
    } catch (error) {
      last = error;
      if (signal.aborted) throw abortError();
      if (attempt > attempts) break;
      if (delayMs > 0) await sleep(delayMs, signal);
    }
  }
  throw last;
}

interface RunOneOptions {
  readonly step: FlowActionStep | FlowAgentStep;
  readonly title: string;
  readonly stepId: string;
  readonly scope: FlowScope;
  readonly actions: FlowActionRegistry;
  readonly signal: AbortSignal;
  readonly runId: string;
  readonly workspace: string;
  readonly agentRunner: FlowAgentRunner | undefined;
  readonly sleep: Sleep;
  readonly now: () => number;
  readonly emit: (event: FlowStepEvent) => void;
}

function agentActionOf(
  step: FlowAgentStep,
  title: string,
  scope: FlowScope,
  runner: FlowAgentRunner | undefined,
): FlowAction {
  const spec = step.agent;
  const prompt = resolveValue(spec.prompt, scope);
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error(`步骤 ${step.id} 的 agent.prompt 不是非空字符串`);
  }
  let cwd: string | undefined;
  if (spec.cwd !== undefined) {
    const resolved = resolveValue(spec.cwd, scope);
    if (typeof resolved !== 'string' || resolved.trim() === '') {
      throw new Error(`步骤 ${step.id} 的 agent.cwd 不是非空字符串`);
    }
    cwd = resolved;
  }
  const request: FlowAgentRequest = {
    stepId: step.id,
    prompt,
    label: spec.label ?? title,
    ...(spec.name === undefined ? {} : { name: spec.name }),
    ...(spec.provider === undefined ? {} : { provider: spec.provider }),
    ...(spec.model === undefined ? {} : { model: spec.model }),
    ...(spec.preset === undefined ? {} : { preset: spec.preset }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(spec.schema === undefined ? {} : { schema: spec.schema }),
  };
  return async (_input, context) => {
    if (runner === undefined) throw new Error('这一步要 agent 跑，但这一趟没有 agent 通道');
    const result = await runner.run(request, context.signal);
    if (result.stopReason !== 'completed') throw new Error(agentStopReasonText(result.stopReason));
    if (spec.schema !== undefined) {
      if (result.value === undefined) throw new Error('agent 没给出符合格式的结论');
      return result.value;
    }
    return result.text;
  };
}

async function runOneInner(options: RunOneOptions): Promise<unknown> {
  const { step, title, stepId, scope, actions, signal, runId, workspace, agentRunner, sleep, now, emit } =
    options;
  const entry =
    'agent' in step
      ? { name: step.id, action: agentActionOf(step, title, scope, agentRunner), meta: {} }
      : actions.get(step.action);
  if (entry === undefined) throw new Error('注册表里没有这个动作');
  const input = 'agent' in step ? undefined : resolveInput(step.with, scope);
  const context: FlowActionContext = {
    signal,
    runId,
    workspace,
    stepId,
    log: (text) => {
      emit({ stepId, title, status: 'running', message: text });
    },
    login: (url) => {
      emit({ stepId, title, status: 'needs-login', loginUrl: url });
    },
    need: (intervention) => {
      emit({ stepId, title, status: 'needs-human', intervention });
    },
  };

  const poll = 'poll' in step ? step.poll : undefined;
  if (poll !== undefined) {
    if ('agent' in step) throw new Error(`步骤 ${step.id} 不支持 poll`);
    const everyMs = Math.max(100, Math.min(60_000, Math.trunc(poll.everyMs)));
    const rawMax = Math.trunc(poll.maxMs);
    const maxMs = rawMax === 0 ? 0 : Math.max(everyMs, Math.min(1_800_000, rawMax));
    const startedAt = now();
    let pollAttempt = 0;
    for (;;) {
      if (signal.aborted) throw abortError();
      pollAttempt += 1;
      emit({
        stepId,
        title,
        status: 'running',
        attempt: pollAttempt,
        message: `第 ${pollAttempt} 次`,
      });
      const value = await callWithRetry(entry.action, input, context, step.retry, sleep, signal);
      if (evalPredicate(poll.until, { ...scope, value })) return value;
      if (maxMs > 0 && now() - startedAt >= maxMs) {
        if (poll.onTimeout === 'continue') return undefined;
        throw new Error(`步骤 ${step.id} 轮询超时（${maxMs}ms）`);
      }
      await sleep(everyMs, signal);
    }
  }

  return callWithRetry(entry.action, input, context, step.retry, sleep, signal, (attempt) => {
    emit({ stepId, title, status: 'running', attempt });
  });
}

async function runOne(options: RunOneOptions): Promise<unknown> {
  try {
    return await runOneInner(options);
  } catch (error) {
    if (error instanceof StepFailure || isAbortError(error)) throw error;
    throw new StepFailure(options.stepId, error);
  }
}

/**
 * 顺序跑一条流程：条件跳过、重试、轮询、逐项展开、子流程、取消；失败停在具体步骤。
 * 不碰平台、不落盘；动作怎么实现由注册表决定。
 * @param options 流程、输入、动作表、取消信号、身份与进度回调。
 * @returns 成功 / 失败 / 停止；失败带 `failedStep`。
 */
export async function runFlow(options: FlowRunOptions): Promise<FlowResult> {
  const { flow, input, actions, signal, runId, workspace, onStep } = options;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => clockNow());
  const steps: Record<string, unknown> = {};
  const emit = (event: FlowStepEvent): void => {
    try {
      onStep(event);
    } catch {
    }
  };
  const target = targetOf(flow, { in: input, steps });
  const shouldStop = (): boolean =>
    flow.stopWhen !== undefined && evalPredicate(flow.stopWhen, { in: input, steps });

  if (shouldStop()) return { status: 'ok', target, steps };

  for (const step of flow.steps) {
    if (signal.aborted) return stopped(steps, target);
    const title = step.title ?? step.id;
    try {
      if (shouldStop()) return { status: 'ok', target, steps };

      if (step.when !== undefined && !evalPredicate(step.when, { in: input, steps })) {
        emit({ stepId: step.id, title, status: 'skipped' });
        if (shouldStop()) return { status: 'ok', target, steps };
        continue;
      }

      if ('flow' in step) {
        emit({ stepId: step.id, title, status: 'running' });
        const subInput = resolveInput(step.with, { in: input, steps });
        const nested = await runFlow({
          flow: step.flow,
          input: subInput,
          actions,
          signal,
          runId: `${runId}/${step.id}`,
          workspace,
          ...(options.agentRunner === undefined ? {} : { agentRunner: options.agentRunner }),
          onStep: (event) => {
            emit({
              ...event,
              stepId: `${step.id}.${event.stepId}`,
              title: `${title} / ${event.title}`,
            });
          },
          sleep,
          now,
        });
        if (nested.status === 'failed') {
          const failed =
            nested.failedStep === undefined ? step.id : `${step.id}.${nested.failedStep}`;
          throw new StepFailure(failed, nested.error ?? new Error(`子流程失败在 ${failed}`));
        }
        steps[step.id] = nested.steps;
        if (nested.status === 'stopped') return stopped(steps, target);
        emit({ stepId: step.id, title, status: 'ok' });
        if (shouldStop()) return { status: 'ok', target, steps };
        continue;
      }

      if (step.forEach !== undefined) {
        const over = resolveValue(step.forEach.over, { in: input, steps });
        if (!Array.isArray(over)) {
          throw new Error(`步骤 ${step.id} 的 forEach.over 不是数组`);
        }
        const max = Math.max(1, Math.min(50, Math.trunc(step.forEach.max)));
        if (over.length > max) {
          throw new Error(`步骤 ${step.id} 的 forEach 有 ${over.length} 项，超过上限 ${max}`);
        }
        const output: unknown[] = [];
        for (const [index, item] of over.entries()) {
          if (signal.aborted) return stopped(steps, target);
          output.push(
            await runOne({
              step,
              title,
              stepId: `${step.id}[${index}]`,
              scope: { in: input, steps, item },
              actions,
              signal,
              runId,
              workspace,
              agentRunner: options.agentRunner,
              sleep,
              now,
              emit,
            }),
          );
        }
        steps[step.id] = output;
        emit({ stepId: step.id, title, status: 'ok' });
        if (shouldStop()) return { status: 'ok', target, steps };
        continue;
      }

      const value = await runOne({
        step,
        title,
        stepId: step.id,
        scope: { in: input, steps },
        actions,
        signal,
        runId,
        workspace,
        agentRunner: options.agentRunner,
        sleep,
        now,
        emit,
      });
      steps[step.id] = value;
      const summary = 'agent' in step ? agentSummaryOf(value) : undefined;
      emit({
        stepId: step.id,
        title,
        status: 'ok',
        ...(summary === undefined ? {} : { message: summary }),
      });
      if (shouldStop()) return { status: 'ok', target, steps };
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return stopped(steps, target);
      if (error instanceof StepFailure) {
        emit({ stepId: error.stepId, title, status: 'failed', message: error.message });
        return {
          status: 'failed',
          target,
          steps,
          failedStep: error.stepId,
          error: error.cause ?? error,
        };
      }
      emit({ stepId: step.id, title, status: 'failed', message: String(error) });
      return { status: 'failed', target, steps, failedStep: step.id, error };
    }
  }

  return { status: 'ok', target, steps };
}
