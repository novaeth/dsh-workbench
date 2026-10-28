import {
  resolveValue,
  runFlow,
  type FlowActionRegistry,
  type FlowDefinition,
  type FlowResult,
  type FlowStepEvent,
  type LongTaskBase,
  type LongTaskDeps,
  type LongTaskRegistry,
  type LongTaskStep,
} from '@dsh-workbench/shared/host';

interface FlowPayload {
  readonly flow: FlowDefinition;
  readonly input: unknown;
  readonly workspace: string;
}

function payloadOf(value: unknown): FlowPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Readonly<Record<string, unknown>>;
  const flow = record['flow'];
  const workspace = record['workspace'];
  if (typeof flow !== 'object' || flow === null) return null;
  if (typeof workspace !== 'string' || workspace === '') return null;
  return { flow: flow as FlowDefinition, input: record['input'], workspace };
}

function longStepOf(event: FlowStepEvent): LongTaskStep {
  if (event.status === 'failed') {
    return {
      kind: 'fail',
      text: event.message === undefined ? event.title : `${event.title}：${event.message}`,
    };
  }
  if (event.status === 'skipped') return { kind: 'info', text: `${event.title}（跳过）` };
  if (event.status === 'ok') return { kind: 'succeed', text: event.title };
  if (event.status === 'needs-login') {
    return {
      kind: 'info',
      text: event.message ?? `${event.title}：需要登录`,
      loginUrl: event.loginUrl ?? '',
    };
  }
  if (event.message !== undefined) return { kind: 'info', text: `${event.title}：${event.message}` };
  if (event.attempt !== undefined && event.attempt > 1) {
    return { kind: 'info', text: `${event.title}（第 ${event.attempt} 次）` };
  }
  return { kind: 'start', text: event.title };
}

function targetOf(flow: FlowDefinition, input: unknown): string {
  if (flow.target === undefined) return flow.id;
  const value = resolveValue(flow.target, { in: input, steps: {} });
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : flow.id;
}

export function flowTaskDeps(
  actions: FlowActionRegistry,
): Pick<LongTaskDeps<LongTaskBase>, 'run' | 'outcome' | 'view' | 'stopped'> {
  return {
    run: async ({ payload, onStep, signal }) => {
      const parsed = payloadOf(payload);
      if (parsed === null) throw new Error('流程 run 的 payload 不对');
      const result = await runFlow({
        flow: parsed.flow,
        input: parsed.input,
        actions,
        signal,
        runId: parsed.flow.id,
        workspace: parsed.workspace,
        onStep: (event) => {
          onStep(longStepOf(event));
        },
      });
      if (result.status === 'failed') {
        throw result.error instanceof Error
          ? result.error
          : new Error(`流程失败在 ${result.failedStep ?? '未知步骤'}`);
      }
      return result;
    },

    outcome: (result) => {
      const flowResult = result as FlowResult;
      if (flowResult.status === 'stopped') return { status: 'stopped', step: '已停止' };
      return { step: '完成' };
    },

    view: (snapshot) => ({
      target: snapshot.target,
      status: snapshot.status,
      step: snapshot.step,
      steps: snapshot.steps,
    }),

    stopped: (current) =>
      current.step === '' ? { step: '已停止' } : { step: `停在「${current.step}」` },
  };
}

export interface StartFlowOptions {
  readonly runs: LongTaskRegistry<LongTaskBase>;
  readonly flow: FlowDefinition;
  readonly input: unknown;
  readonly workspace: string;
  readonly session?: string | undefined;
}

export function startFlow(options: StartFlowOptions): LongTaskBase {
  return options.runs.start({
    workspace: options.workspace,
    target: targetOf(options.flow, options.input),
    payload: {
      flow: options.flow,
      input: options.input,
      workspace: options.workspace,
    } satisfies FlowPayload,
    ...(options.session === undefined ? {} : { session: options.session }),
  });
}
