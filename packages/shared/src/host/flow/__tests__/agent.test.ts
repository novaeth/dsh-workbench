import { describe, expect, it } from 'vitest';
import { createFlowHost } from '../kit.js';
import { createFlowActionRegistry, runFlow } from '../run.js';
import type {
  FlowActionRegistry,
  FlowAgentPort,
  FlowAgentRequest,
  FlowAgentResult,
  FlowAgentRunner,
  FlowDefinition,
  FlowStep,
  FlowStepEvent,
  FlowValue,
} from '../types.js';

const ref = (path: string): FlowValue => ({ $ref: path });
const lit = (value: unknown): FlowValue => ({ $lit: value });

function recorded(answer: (request: FlowAgentRequest, signal: AbortSignal) => Promise<FlowAgentResult>): {
  readonly runner: FlowAgentRunner;
  readonly requests: FlowAgentRequest[];
  readonly disposed: { value: boolean };
} {
  const requests: FlowAgentRequest[] = [];
  const disposed = { value: false };
  return {
    requests,
    disposed,
    runner: {
      async run(request, signal) {
        requests.push(request);
        return answer(request, signal);
      },
      async dispose() {
        disposed.value = true;
      },
    },
  };
}

function answerOf(parts: Partial<FlowAgentResult> & { readonly text: string }): FlowAgentResult {
  return {
    childId: 'child-1',
    name: 'agent-1',
    stopReason: 'completed',
    ...parts,
  };
}

function flowOf(steps: readonly FlowStep[]): FlowDefinition {
  return { id: 'sample', title: '样例', steps };
}

async function runWith(
  flow: FlowDefinition,
  actions: FlowActionRegistry,
  options: {
    readonly agentRunner?: FlowAgentRunner | undefined;
    readonly input?: unknown;
    readonly signal?: AbortSignal;
  } = {},
): Promise<{ result: Awaited<ReturnType<typeof runFlow>>; events: FlowStepEvent[] }> {
  const events: FlowStepEvent[] = [];
  const result = await runFlow({
    flow,
    input: options.input ?? {},
    actions,
    signal: options.signal ?? new AbortController().signal,
    runId: 'run-1',
    workspace: '/w/a',
    onStep: (event) => events.push(event),
    ...(options.agentRunner === undefined ? {} : { agentRunner: options.agentRunner }),
  });
  return { result, events };
}

describe('agent 步骤：读与判断', () => {
  it('文本结果进 steps，步骤行带一行摘要', async () => {
    const recorder = recorded(async () =>
      answerOf({ text: '有 3 处要改：先修构建\n第二行是细节' }),
    );
    const { result, events } = await runWith(
      flowOf([{ id: 'review', title: '评审', agent: { prompt: lit('看一下 diff') } }]),
      createFlowActionRegistry(),
      { agentRunner: recorder.runner },
    );

    expect(result.status).toBe('ok');
    expect(result.steps['review']).toBe('有 3 处要改：先修构建\n第二行是细节');
    expect(recorder.requests[0]).toMatchObject({
      stepId: 'review',
      prompt: '看一下 diff',
      label: '评审',
    });
    const ok = events.find((event) => event.stepId === 'review' && event.status === 'ok');
    expect(ok?.message).toBe('有 3 处要改：先修构建');
  });

  it('schema 结果进 steps，后面的步骤能 $ref 到字段', async () => {
    const recorder = recorded(async () =>
      answerOf({ text: '结论：可以发', value: { verdict: 'go', reasons: ['构建绿'] } }),
    );
    const actions = createFlowActionRegistry();
    const seen: unknown[] = [];
    actions.register('read', async (input) => {
      seen.push(input);
      return 'ok';
    });
    const { result } = await runWith(
      flowOf([
        {
          id: 'review',
          title: '评审',
          agent: {
            prompt: lit('判断能不能发'),
            schema: {
              type: 'object',
              properties: { verdict: { type: 'string' } },
              required: ['verdict'],
            },
          },
        },
        { id: 'use', action: 'read', with: { verdict: ref('steps.review.verdict') } },
      ]),
      actions,
      { agentRunner: recorder.runner },
    );

    expect(result.status).toBe('ok');
    expect(result.steps['review']).toEqual({ verdict: 'go', reasons: ['构建绿'] });
    expect(seen).toEqual([{ verdict: 'go' }]);
  });

  it('prompt 可以用 in 与 forEach 的 item', async () => {
    const recorder = recorded(async (request) => answerOf({ text: `评估 ${request.prompt}` }));
    const { result } = await runWith(
      flowOf([
        {
          id: 'each',
          title: '逐个',
          forEach: { over: ref('in.envs'), as: 'env', max: 3 },
          agent: { prompt: ref('item') },
        },
      ]),
      createFlowActionRegistry(),
      { input: { envs: ['dev', 'prod'] }, agentRunner: recorder.runner },
    );

    expect(result.steps['each']).toEqual(['评估 dev', '评估 prod']);
    expect(recorder.requests.map((request) => request.prompt)).toEqual(['dev', 'prod']);
  });

  it('没跑完的 agent 让这一步失败，不往 steps 写半截值，后面的步骤不跑', async () => {
    const recorder = recorded(async () =>
      answerOf({ text: '半截', stopReason: 'max-tokens' }),
    );
    const actions = createFlowActionRegistry();
    let ran = false;
    actions.register('after', async () => {
      ran = true;
      return 'ok';
    });
    const { result, events } = await runWith(
      flowOf([
        { id: 'review', title: '评审', agent: { prompt: lit('看一下') } },
        { id: 'after', action: 'after' },
      ]),
      actions,
      { agentRunner: recorder.runner },
    );

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBe('review');
    expect(result.steps['review']).toBeUndefined();
    expect(ran).toBe(false);
    expect(events.find((event) => event.status === 'failed')?.message).toContain('输出上限');
  });

  it('要了 schema 却没给出结构化值，也算失败', async () => {
    const recorder = recorded(async () => answerOf({ text: '只有文字' }));
    const { result } = await runWith(
      flowOf([
        {
          id: 'review',
          agent: { prompt: lit('给结论'), schema: { type: 'object', properties: {} } },
        },
      ]),
      createFlowActionRegistry(),
      { agentRunner: recorder.runner },
    );

    expect(result.status).toBe('failed');
    expect(String((result.error as Error).message)).toContain('符合格式');
  });

  it('retry 重跑同一段提示词', async () => {
    let attempt = 0;
    const recorder = recorded(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('模型抽风');
      return answerOf({ text: '这次成了' });
    });
    const { result } = await runWith(
      flowOf([
        {
          id: 'review',
          agent: { prompt: lit('看一下') },
          retry: { attempts: 1, delayMs: 0 },
        },
      ]),
      createFlowActionRegistry(),
      { agentRunner: recorder.runner },
    );

    expect(result.status).toBe('ok');
    expect(result.steps['review']).toBe('这次成了');
    expect(recorder.requests).toHaveLength(2);
  });

  it('没有 agent 通道时给一句能照着改的话', async () => {
    const { result } = await runWith(
      flowOf([{ id: 'review', agent: { prompt: lit('看一下') } }]),
      createFlowActionRegistry(),
    );

    expect(result.status).toBe('failed');
    expect(String((result.error as Error).message)).toContain('没有 agent 通道');
  });

  it('跑到一半被停：整条流程是 stopped，不是 failed', async () => {
    const controller = new AbortController();
    const recorder = recorded(async () => {
      controller.abort();
      return answerOf({ text: '不该用上', stopReason: 'aborted' });
    });
    const events: FlowStepEvent[] = [];
    const result = await runFlow({
      flow: flowOf([{ id: 'review', agent: { prompt: lit('看一下') } }]),
      input: {},
      actions: createFlowActionRegistry(),
      signal: controller.signal,
      runId: 'run-1',
      workspace: '/w/a',
      onStep: (event) => events.push(event),
      agentRunner: recorder.runner,
    });

    expect(result.status).toBe('stopped');
    expect(result.steps['review']).toBeUndefined();
  });

  it('运行期塞进 poll 直接拒', async () => {
    const recorder = recorded(async () => answerOf({ text: '不该跑' }));
    const { result } = await runWith(
      flowOf([
        {
          id: 'review',
          agent: { prompt: lit('看一下') },
          poll: { everyMs: 1000, maxMs: 5000, until: { $exists: ref('value') } },
        } as unknown as FlowStep,
      ]),
      createFlowActionRegistry(),
      { agentRunner: recorder.runner },
    );

    expect(result.status).toBe('failed');
    expect(String((result.error as Error).message)).toContain('不支持 poll');
    expect(recorder.requests).toHaveLength(0);
  });
});

describe('createFlowHost：通道、预算与收摊', () => {
  it('有 agent 节点时开一次通道，跑完收摊', async () => {
    const recorder = recorded(async () => answerOf({ text: '好' }));
    const opened: Array<{ sessionId: string | undefined }> = [];
    const port: FlowAgentPort = {
      async open(context) {
        opened.push({ sessionId: context.sessionId });
        return recorder.runner;
      },
    };
    const host = createFlowHost(port);
    const result = await host.run({
      flow: flowOf([
        { id: 'a', agent: { prompt: lit('一') } },
        { id: 'b', agent: { prompt: lit('二') } },
      ]),
      input: {},
      actions: host.createActions(),
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w/a',
      sessionId: 's-1',
      onStep: () => {},
    });

    expect(result.status).toBe('ok');
    expect(opened).toEqual([{ sessionId: 's-1' }]);
    expect(recorder.disposed.value).toBe(true);
  });

  it('没有 agent 节点的流程不开通道', async () => {
    const opened: string[] = [];
    const host = createFlowHost({
      async open(context) {
        opened.push(context.workspace);
        return recorded(async () => answerOf({ text: '' })).runner;
      },
    });
    const actions = host.createActions();
    actions.register('read', async () => 'ok');
    const result = await host.run({
      flow: flowOf([{ id: 'read', action: 'read' }]),
      input: {},
      actions,
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w/a',
      onStep: () => {},
    });

    expect(result.status).toBe('ok');
    expect(opened).toEqual([]);
  });

  it('次数上限：超过就失败，整条通道照样收摊', async () => {
    const recorder = recorded(async () => answerOf({ text: '好' }));
    const host = createFlowHost({
      async open() {
        return recorder.runner;
      },
    });
    const capped = await host.run({
      flow: flowOf([
        { id: 'a', agent: { prompt: lit('一') } },
        { id: 'b', agent: { prompt: lit('二') } },
        { id: 'c', agent: { prompt: lit('三') } },
      ]),
      input: {},
      actions: host.createActions(),
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w/a',
      maxAgents: 2,
      onStep: () => {},
    });

    expect(capped.status).toBe('failed');
    expect(capped.failedStep).toBe('c');
    expect(String((capped.error as Error).message)).toContain('最多跑 2 次');
    expect(recorder.disposed.value).toBe(true);
  });

  it('agent 抛错时也收摊', async () => {
    const recorder = recorded(async () => {
      throw new Error('起不来');
    });
    const host = createFlowHost({
      async open() {
        return recorder.runner;
      },
    });
    const result = await host.run({
      flow: flowOf([{ id: 'a', agent: { prompt: lit('一') } }]),
      input: {},
      actions: host.createActions(),
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w/a',
      onStep: () => {},
    });

    expect(result.status).toBe('failed');
    expect(recorder.disposed.value).toBe(true);
  });

  it('check 在没有端口时报「没有 agent 能力」', () => {
    const host = createFlowHost();
    const check = host.check(
      flowOf([{ id: 'a', agent: { prompt: lit('一') } }]),
      host.createActions(),
    );
    expect(check.ok).toBe(false);
    expect(check.problems[0]?.problem).toContain('没有 agent 能力');
  });
});
