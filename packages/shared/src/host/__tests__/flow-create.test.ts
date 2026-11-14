import { describe, expect, it } from 'vitest';
import type { DshToolRunContext } from '../../api/dsh.js';
import { createFlowHost } from '../flow/kit.js';
import { createFlowTask } from '../flow/create.js';
import { createLongTaskHost } from '../long-task.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function hostOf() {
  const flowHost = createFlowHost();
  const longTasks = createLongTaskHost({ scope: 'test', unit: 'demo', bump: () => {} });
  return { flowHost, longTasks };
}

describe('createFlowTask：流程 + 长任务 + 工具的三件套', () => {
  it('★★ 校验 → 建注册表 → start 推导 target / 跑完是 ok / 工具同一实现', async () => {
    const { flowHost, longTasks } = hostOf();
    const actions = flowHost.createActions();
    actions.register('read', async () => 'ok', { title: '读' });
    const task = createFlowTask({
      key: 'sample',
      flow: {
        id: 'sample',
        title: '样例',
        target: { $ref: 'in.path' },
        steps: [{ id: 'read', title: '读', action: 'read' }],
      },
      actions,
      flowHost,
      longTasks: longTasks.host,
      tool: { name: 'run', description: '跑一遍' },
    });

    const started = task.start({ workspace: '/w/a', input: { path: '/w/target' }, session: 's-1' });
    await tick();

    expect(task.runs.snapshot(started.id)).toMatchObject({
      status: 'ok',
      target: '/w/target',
      workspace: '/w/a',
      session: 's-1',
    });
    expect(task.tool.name).toBe('run');
    const output = await task.tool.execute(
      { runId: started.id },
      { agent: { session: { header: { cwd: '/w/a' } } } } as unknown as DshToolRunContext,
    );
    expect(output).toMatchObject({ ok: true, runId: started.id, status: 'ok' });
    longTasks.dispose();
  });

  it('★★ 流程过不了 check 就不建注册表，错误里带步骤路径', () => {
    const { flowHost, longTasks } = hostOf();
    const actions = flowHost.createActions();
    expect(() =>
      createFlowTask({
        key: 'bad',
        flow: {
          id: 'bad',
          title: '坏流程',
          steps: [{ id: 'read', title: '读', action: 'missing' }],
        },
        actions,
        flowHost,
        longTasks: longTasks.host,
        tool: { name: 'run', description: '跑' },
      }),
    ).toThrow(/missing/);
    longTasks.dispose();
  });

  it('★★ 没有 agent 通道时不建带 agent 节点的流程，错误里带步骤路径', () => {
    const { flowHost, longTasks } = hostOf();
    const actions = flowHost.createActions();
    expect(() =>
      createFlowTask({
        key: 'agent-flow',
        flow: {
          id: 'agent-flow',
          title: '带 agent 的流程',
          steps: [{ id: 'review', title: '评审', agent: { prompt: { $lit: '看一下' } } }],
        },
        actions,
        flowHost,
        longTasks: longTasks.host,
        tool: { name: 'run', description: '跑' },
      }),
    ).toThrow(/agent 能力/);
    longTasks.dispose();
  });

  it('★ 有 agent 端口时建得起来，agent 步骤照常跑', async () => {
    const { longTasks } = hostOf();
    const flowHost = createFlowHost({
      agents: {
        async open() {
          return {
            async run() {
              return { text: '可以发', childId: 'c-1', name: 'agent-1', stopReason: 'completed' };
            },
            async dispose() {},
          };
        },
      },
    });
    const task = createFlowTask({
      key: 'agent-ok',
      flow: {
        id: 'agent-ok',
        title: '带 agent 的流程',
        steps: [{ id: 'review', title: '评审', agent: { prompt: { $lit: '看一下' } } }],
      },
      actions: flowHost.createActions(),
      flowHost,
      longTasks: longTasks.host,
      tool: { name: 'run', description: '跑' },
    });

    const started = task.start({ workspace: '/w/a', session: 's-1' });
    await tick();
    expect(task.runs.snapshot(started.id)).toMatchObject({ status: 'ok', session: 's-1' });
    longTasks.dispose();
  });
});
