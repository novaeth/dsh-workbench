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

describe('runFlow advanced', () => {
  it('forEach 里每项单独 poll', async () => {
    const calls = new Map<string, number>();
    const actions = actionsOf({
      job: async (input) => {
        const id = (input as { id: string }).id;
        const count = (calls.get(id) ?? 0) + 1;
        calls.set(id, count);
        return { id, done: count >= 2 };
      },
    });

    let clock = 0;
    const { result } = await runFlowWith(
      {
        id: 'each-poll',
        title: '逐项轮询',
        steps: [
          {
            id: 'job',
            action: 'job',
            forEach: { over: ref('in.ids'), as: 'item', max: 3 },
            with: { id: ref('item') },
            poll: {
              everyMs: 100,
              maxMs: 1000,
              until: { $eq: [ref('value.done'), lit(true)] },
            },
          },
        ],
      },
      actions,
      { ids: ['a', 'b'] },
      {
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.steps['job']).toEqual([
      { id: 'a', done: true },
      { id: 'b', done: true },
    ]);
    expect([...calls.values()]).toEqual([2, 2]);
  });

  it('poll.onTimeout=continue：超时写 undefined，后续 when 决定', async () => {
    const actions = actionsOf({
      find: async () => null,
      fallback: async () => 'triggered',
    });

    let clock = 0;
    const { result } = await runFlowWith(
      {
        id: 'fallback',
        title: '兜底',
        steps: [
          {
            id: 'find',
            action: 'find',
            poll: {
              everyMs: 100,
              maxMs: 250,
              onTimeout: 'continue',
              until: { $exists: ref('value') },
            },
          },
          {
            id: 'fallback',
            action: 'fallback',
            when: { $not: { $exists: ref('steps.find') } },
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
    expect(result.steps['find']).toBeUndefined();
    expect(result.steps['fallback']).toBe('triggered');
  });

  it('poll.maxMs=0 表示不限时', async () => {
    let calls = 0;
    const actions = actionsOf({
      job: async () => {
        calls += 1;
        return calls < 3 ? { done: false } : { done: true };
      },
    });

    let clock = 0;
    const { result } = await runFlowWith(
      {
        id: 'unlimited',
        title: '不限',
        steps: [
          {
            id: 'job',
            action: 'job',
            poll: {
              everyMs: 100,
              maxMs: 0,
              until: { $eq: [ref('value.done'), lit(true)] },
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
  });

  it('动作能发 needs-login 事件，流程继续', async () => {
    const actions = actionsOf({
      auth: async (_input, context) => {
        context.login('https://example.com/login');
        return 'ok';
      },
    });

    const { result, events } = await runFlowWith(
      { id: 'login', title: '登录', steps: [{ id: 'auth', action: 'auth' }] },
      actions,
    );

    expect(result.status).toBe('ok');
    expect(events).toContainEqual({
      stepId: 'auth',
      title: 'auth',
      status: 'needs-login',
      loginUrl: 'https://example.com/login',
    });
  });

  it('子流程：with 作为 in，结果挂 steps.<id>，事件带前缀', async () => {
    const actions = actionsOf({
      read: async (input) => ({ mergedSha: (input as { sha: string }).sha }),
    });
    const merge: FlowDefinition = {
      id: 'merge',
      title: '合并',
      steps: [{ id: 'read', action: 'read', with: { sha: ref('in.sha') } }],
    };
    const after: FlowDefinition = {
      id: 'after',
      title: '后续',
      steps: [{ id: 'use', action: 'read', with: { sha: ref('in.sha') } }],
    };

    const { result, events } = await runFlowWith(
      {
        id: 'publish',
        title: '发布',
        steps: [
          { id: 'merge', title: '合并', flow: merge, with: { sha: ref('in.sha') } },
          {
            id: 'after',
            title: '后续',
            flow: after,
            with: { sha: ref('steps.merge.read.mergedSha') },
          },
        ],
      },
      actions,
      { sha: 'abc' },
    );

    expect(result.status).toBe('ok');
    expect(result.steps['merge']).toEqual({ read: { mergedSha: 'abc' } });
    expect(result.steps['after']).toEqual({ use: { mergedSha: 'abc' } });
    expect(events.some((event) => event.stepId === 'merge.read' && event.status === 'ok')).toBe(
      true,
    );
  });

  it('子流程失败：failedStep 带外层步骤前缀', async () => {
    const actions = actionsOf({
      boom: async () => {
        throw new Error('boom');
      },
    });

    const { result } = await runFlowWith(
      {
        id: 'outer',
        title: '外层',
        steps: [
          {
            id: 'sub',
            title: '子',
            flow: {
              id: 'sub',
              title: '子',
              steps: [{ id: 'boom', action: 'boom' }],
            },
          },
        ],
      },
      actions,
    );

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBe('sub.boom');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('stopWhen：满足条件后不再跑后面的步骤', async () => {
    let after = 0;
    const actions = actionsOf({
      read: async () => 'ok',
      after: async () => {
        after += 1;
        return 'no';
      },
    });

    const { result } = await runFlowWith(
      {
        id: 'stop',
        title: '提前停',
        stopWhen: { $exists: ref('steps.read') },
        steps: [
          { id: 'read', action: 'read' },
          { id: 'after', action: 'after' },
        ],
      },
      actions,
    );

    expect(result.status).toBe('ok');
    expect(after).toBe(0);
    expect(result.steps['read']).toBe('ok');
  });
});
