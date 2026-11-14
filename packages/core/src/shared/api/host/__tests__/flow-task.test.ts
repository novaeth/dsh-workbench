import { describe, expect, it } from 'vitest';
import {
  createFlowActionRegistry,
  createFlowHost,
  createLongTaskRegistry,
  type FlowActionRegistry,
  type FlowDefinition,
} from '@dsh-workbench/shared/host';
import { flowTaskDeps, startFlow } from '../flow/task.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function runsOf(actions: FlowActionRegistry, flowHost?: ReturnType<typeof createFlowHost>) {
  return createLongTaskRegistry({
    ...flowTaskDeps(actions, flowHost),
    now: () => '2026-10-28T00:00:00.000Z',
    nextId: () => 'run-1',
  });
}

const readFlow: FlowDefinition = {
  id: 'check',
  title: '检查',
  target: { $ref: 'in.env' },
  steps: [{ id: 'read', action: 'read' }],
};

describe('flowTaskDeps / startFlow', () => {
  it('起一条流程：立刻回 running，结算后是 ok，步骤进快照', async () => {
    const actions = createFlowActionRegistry();
    actions.register('read', async () => ({ rows: [1, 2] }));
    const runs = runsOf(actions);

    const started = startFlow({ runs, flow: readFlow, input: { env: 'test' }, workspace: '/w/a' });
    expect(started.status).toBe('running');
    expect(started.target).toBe('test');

    await tick();
    const snapshot = runs.snapshot(started.id);
    expect(snapshot?.status).toBe('ok');
    expect(snapshot?.steps.some((step) => step.includes('read'))).toBe(true);
  });

  it('同 (工作区, target) 复用，不并发第二条', async () => {
    const actions = createFlowActionRegistry();
    actions.register('slow', async (_input, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return 'ok';
    });
    const runs = runsOf(actions);
    const flow: FlowDefinition = {
      id: 'slow',
      title: '慢',
      target: { $ref: 'in.env' },
      steps: [{ id: 'slow', action: 'slow' }],
    };

    const first = startFlow({ runs, flow, input: { env: 'test' }, workspace: '/w/a' });
    const again = startFlow({ runs, flow, input: { env: 'test' }, workspace: '/w/a' });

    expect(again.id).toBe(first.id);
    runs.stop(first.id);
    await tick();
  });

  it('动作抛错：这一趟 failed，why 是原话', async () => {
    const actions = createFlowActionRegistry();
    actions.register('boom', async () => {
      throw new Error('boom');
    });
    const runs = runsOf(actions);
    const started = startFlow({
      runs,
      flow: { id: 'fail', title: '失败', steps: [{ id: 'boom', action: 'boom' }] },
      input: {},
      workspace: '/w/a',
    });

    await tick();
    const snapshot = runs.snapshot(started.id);
    expect(snapshot?.status).toBe('failed');
    expect(snapshot?.why).toBe('boom');
  });

  it('停止：结算是 stopped，不是 failed', async () => {
    const actions = createFlowActionRegistry();
    actions.register('slow', async (_input, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new Error('aborted');
    });
    const runs = runsOf(actions);
    const started = startFlow({
      runs,
      flow: { id: 'stop', title: '停止', steps: [{ id: 'slow', action: 'slow' }] },
      input: {},
      workspace: '/w/a',
    });

    expect(runs.stop(started.id)).toBe(true);
    await tick();
    expect(runs.snapshot(started.id)?.status).toBe('stopped');
  });

  it('动作发 needs-login：长任务进 needs-login，带 loginUrl，恢复后回 ok', async () => {
    const actions = createFlowActionRegistry();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    actions.register('slow', async (_input, context) => {
      context.login('https://example.com/login');
      await gate;
      return 'ok';
    });
    const runs = runsOf(actions);
    const started = startFlow({
      runs,
      flow: { id: 'login', title: '登录', steps: [{ id: 'slow', action: 'slow' }] },
      input: {},
      workspace: '/w/a',
    });

    await tick();
    const waiting = runs.snapshot(started.id);
    expect(waiting?.status).toBe('needs-login');
    expect(waiting?.loginUrl).toBe('https://example.com/login');
    expect(flowTaskDeps(actions).view?.(waiting as NonNullable<typeof waiting>)).toMatchObject({
      status: 'needs-login',
      loginUrl: 'https://example.com/login',
    });

    release?.();
    await tick();
    expect(runs.snapshot(started.id)?.status).toBe('ok');
  });

  it('动作发 need：进 needs-human，intervention 随快照与 view 一起出去，恢复后回 ok', async () => {
    const actions = createFlowActionRegistry();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const intervention = {
      title: '去控制台点「确认发布」',
      hint: '发布会话在等你',
      actions: [
        { kind: 'open-url', url: 'https://example.com/console', label: '打开控制台' },
        { kind: 'copy', text: 'abc-123' },
      ],
    } as const;
    actions.register('slow', async (_input, context) => {
      context.need(intervention);
      await gate;
      return 'ok';
    });
    const runs = runsOf(actions);
    const started = startFlow({
      runs,
      flow: { id: 'need', title: '等人', steps: [{ id: 'slow', action: 'slow' }] },
      input: {},
      workspace: '/w/a',
    });

    await tick();
    const waiting = runs.snapshot(started.id);
    expect(waiting?.status).toBe('needs-human');
    expect(waiting?.intervention).toEqual(intervention);
    expect(flowTaskDeps(actions).view?.(waiting as NonNullable<typeof waiting>)).toMatchObject({
      status: 'needs-human',
      intervention,
    });

    release?.();
    await tick();
    expect(runs.snapshot(started.id)?.status).toBe('ok');
  });
});

describe('flowTaskDeps · data 步骤', () => {
  it('流程里的 data 步骤跑通，结果进快照，耗时进步骤行', async () => {
    const actions = createFlowActionRegistry();
    const flowHost = createFlowHost({
      data: {
        plan: async () => ({
          rows: { ok: true, data: [1, 2], elapsedMs: 3 },
        }),
      },
    });
    const runs = runsOf(actions, flowHost);
    const flow: FlowDefinition = {
      id: 'data',
      title: '读数据',
      steps: [
        {
          id: 'read',
          title: '读待办',
          data: {
            origin: 'https://oa.example.com',
            steps: [{ name: 'rows', request: { method: 'GET', path: '/api/rows' } }],
          },
        },
      ],
    };

    const started = startFlow({ runs, flow, input: {}, workspace: '/w/a' });
    await tick();
    const snapshot = runs.snapshot(started.id);
    expect(snapshot?.status).toBe('ok');
    expect(snapshot?.steps.some((step) => step.includes('读数据：1 跳 3ms'))).toBe(true);
  });
});
