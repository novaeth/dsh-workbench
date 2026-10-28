import { describe, expect, it } from 'vitest';
import { createFlowActionRegistry, runFlow } from '../run.js';
import type {
  FlowAction,
  FlowActionRegistry,
  FlowDefinition,
  FlowResult,
  FlowStepEvent,
  FlowValue,
} from '../types.js';

const ref = (path: string): FlowValue => ({ $ref: path });
const lit = (value: unknown): FlowValue => ({ $lit: value });

function actionsOf(entries: Readonly<Record<string, FlowAction>>): FlowActionRegistry {
  const registry = createFlowActionRegistry();
  for (const [name, action] of Object.entries(entries)) registry.register(name, action);
  return registry;
}

interface RunExtra {
  readonly signal?: AbortSignal | undefined;
  readonly sleep?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
}

async function runFlowWith(
  flow: FlowDefinition,
  actions: FlowActionRegistry,
  input: unknown = {},
  extra: RunExtra = {},
): Promise<{ result: FlowResult; events: FlowStepEvent[] }> {
  const events: FlowStepEvent[] = [];
  const result = await runFlow({
    flow,
    input,
    actions,
    signal: extra.signal ?? new AbortController().signal,
    runId: 'run-1',
    workspace: '/w/a',
    onStep: (event) => events.push(event),
    ...(extra.sleep === undefined ? {} : { sleep: extra.sleep }),
    ...(extra.now === undefined ? {} : { now: extra.now }),
  });
  return { result, events };
}

describe('runFlow', () => {
  it('顺序跑三步，with 从前面步骤取值', async () => {
    const seen: unknown[] = [];
    const actions = actionsOf({
      read: async () => ({ rows: [1, 2] }),
      write: async (input) => {
        seen.push(input);
        return { count: 2 };
      },
      summary: async (input) => {
        seen.push(input);
        return 'ok';
      },
    });

    const { result, events } = await runFlowWith(
      {
        id: 'check',
        title: '检查',
        target: ref('in.env'),
        steps: [
          { id: 'read', action: 'read' },
          { id: 'write', action: 'write', with: { rows: ref('steps.read.rows') } },
          { id: 'summary', action: 'summary', with: { count: ref('steps.write.count') } },
        ],
      },
      actions,
      { env: 'test' },
    );

    expect(result.status).toBe('ok');
    expect(result.target).toBe('test');
    expect(result.steps).toEqual({
      read: { rows: [1, 2] },
      write: { count: 2 },
      summary: 'ok',
    });
    expect(seen).toEqual([{ rows: [1, 2] }, { count: 2 }]);
    expect(events.filter((event) => event.status === 'ok').map((event) => event.stepId)).toEqual([
      'read',
      'write',
      'summary',
    ]);
  });

  it('重试：前两次抛错，第三次成功', async () => {
    let calls = 0;
    const actions = actionsOf({
      flaky: async () => {
        calls += 1;
        if (calls < 3) throw new Error('boom');
        return 'ok';
      },
    });

    const { result, events } = await runFlowWith(
      {
        id: 'retry',
        title: '重试',
        steps: [{ id: 'flaky', action: 'flaky', retry: { attempts: 2, delayMs: 10 } }],
      },
      actions,
      {},
      { sleep: async () => {} },
    );

    expect(result.status).toBe('ok');
    expect(calls).toBe(3);
    expect(
      events.filter((event) => event.status === 'running').map((event) => event.attempt),
    ).toEqual([1, 2, 3]);
  });

  it('轮询：直到 until 为真', async () => {
    let calls = 0;
    let clock = 0;
    const actions = actionsOf({
      job: async () => {
        calls += 1;
        return calls < 3 ? { status: 'pending' } : { status: 'done' };
      },
    });

    const { result, events } = await runFlowWith(
      {
        id: 'poll',
        title: '轮询',
        steps: [
          {
            id: 'job',
            action: 'job',
            poll: {
              everyMs: 100,
              maxMs: 1000,
              until: { $eq: [ref('value.status'), lit('done')] },
            },
          },
        ],
      },
      actions,
      {},
      {
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(calls).toBe(3);
    expect(events.filter((event) => event.status === 'running')).toHaveLength(3);
  });

  it('轮询超时判失败，并指出步骤', async () => {
    let clock = 0;
    const actions = actionsOf({ job: async () => ({ status: 'pending' }) });

    const { result } = await runFlowWith(
      {
        id: 'timeout',
        title: '超时',
        steps: [
          {
            id: 'job',
            action: 'job',
            poll: {
              everyMs: 100,
              maxMs: 250,
              until: { $eq: [ref('value.status'), lit('done')] },
            },
          },
        ],
      },
      actions,
      {},
      {
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      },
    );

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBe('job');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('取消：结果是 stopped，后面的步骤不跑', async () => {
    const controller = new AbortController();
    const actions = actionsOf({
      slow: async (_input, context) => {
        await new Promise<void>((resolve) => {
          if (context.signal.aborted) {
            resolve();
            return;
          }
          context.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        throw new Error('aborted');
      },
      after: async () => 'no',
    });

    const running = runFlowWith(
      {
        id: 'cancel',
        title: '取消',
        steps: [
          { id: 'slow', action: 'slow' },
          { id: 'after', action: 'after' },
        ],
      },
      actions,
      {},
      { signal: controller.signal },
    );
    await Promise.resolve();
    controller.abort();
    const { result, events } = await running;

    expect(result.status).toBe('stopped');
    expect(result.steps).toEqual({});
    expect(events.some((event) => event.stepId === 'after')).toBe(false);
  });

  it('when 为假：跳过，不调动作', async () => {
    let calls = 0;
    const actions = actionsOf({
      only: async () => {
        calls += 1;
        return 'ok';
      },
    });

    const { result, events } = await runFlowWith(
      {
        id: 'skip',
        title: '跳过',
        steps: [{ id: 'only', action: 'only', when: { $eq: [ref('in.env'), lit('prod')] } }],
      },
      actions,
      { env: 'test' },
    );

    expect(result.status).toBe('ok');
    expect(result.steps).toEqual({});
    expect(calls).toBe(0);
    expect(events).toEqual([{ stepId: 'only', title: 'only', status: 'skipped' }]);
  });

  it('forEach：逐项串行，with 能取 item', async () => {
    const seen: unknown[] = [];
    const actions = actionsOf({
      one: async (input) => {
        seen.push(input);
        return (input as { id: number }).id;
      },
    });

    const { result } = await runFlowWith(
      {
        id: 'each',
        title: '逐项',
        steps: [
          {
            id: 'one',
            action: 'one',
            forEach: { over: ref('in.items'), as: 'item', max: 3 },
            with: { id: ref('item.id') },
          },
        ],
      },
      actions,
      { items: [{ id: 1 }, { id: 2 }] },
    );

    expect(result.status).toBe('ok');
    expect(result.steps['one']).toEqual([1, 2]);
    expect(seen).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('target 缺省回落流程 id', async () => {
    const actions = actionsOf({ noop: async () => 'ok' });
    const { result } = await runFlowWith(
      { id: 'fallback', title: '回落', steps: [{ id: 'noop', action: 'noop' }] },
      actions,
      {},
    );

    expect(result.target).toBe('fallback');
  });
});
