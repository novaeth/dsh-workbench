import { describe, expect, it } from 'vitest';
import {
  createFlowActionRegistry,
  createLongTaskRegistry,
  type FlowActionRegistry,
  type FlowDefinition,
} from '@dsh-workbench/shared/host';
import { flowTaskDeps, startFlow } from '../flow/task.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function runsOf(actions: FlowActionRegistry) {
  return createLongTaskRegistry({
    ...flowTaskDeps(actions),
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

    release?.();
    await tick();
    expect(runs.snapshot(started.id)?.status).toBe('ok');
  });
});
