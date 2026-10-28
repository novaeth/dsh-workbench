import { describe, expect, it } from 'vitest';
import type { DshToolRunContext } from '@dsh-workbench/shared';
import {
  createFlowActionRegistry,
  createLongTaskRegistry,
  type FlowDefinition,
} from '@dsh-workbench/shared/host';
import { flowTaskDeps } from '../flow/task.js';
import { flowTool } from '../flow/tool.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface ToolResult {
  readonly ok: boolean;
  readonly runId?: string | undefined;
  readonly status?: string | undefined;
  readonly text?: string | undefined;
}

const flow: FlowDefinition = {
  id: 'check',
  title: '检查',
  steps: [{ id: 'read', action: 'read' }],
};

function harness() {
  const actions = createFlowActionRegistry();
  actions.register('read', async () => ({ rows: [] }));
  let n = 0;
  const runs = createLongTaskRegistry({
    ...flowTaskDeps(actions),
    now: () => '2026-10-28T00:00:00.000Z',
    nextId: () => `run-${(n += 1)}`,
  });
  const tool = flowTool({ name: 'flow_check', description: '检查', flow, actions, runs });
  const exec: DshToolRunContext = {
    agent: { session: { id: 's1', header: { cwd: '/w/a' } } },
  };
  return { tool, exec };
}

describe('flowTool', () => {
  it('起一条跑，再按 runId 看那一条', async () => {
    const { tool, exec } = harness();

    const started = (await tool.execute({ input: {} }, exec)) as ToolResult;
    expect(started.ok).toBe(true);
    expect(started.runId).toBe('run-1');
    expect(started.status).toBe('running');

    await tick();
    const again = (await tool.execute({ runId: 'run-1' }, exec)) as ToolResult;
    expect(again.ok).toBe(true);
    expect(again.status).toBe('ok');
    expect(again.text).toContain('流程 check');
  });

  it('没有工作区就拒，不硬跑', async () => {
    const { tool } = harness();
    const out = (await tool.execute({ input: {} }, {})) as ToolResult;
    expect(out).toEqual({ ok: false, text: '这个会话没有工作区。' });
  });

  it('runId 不存在就说没有', async () => {
    const { tool, exec } = harness();
    const out = (await tool.execute({ runId: 'nope' }, exec)) as ToolResult;
    expect(out.ok).toBe(false);
    expect(out.text).toContain('没有这条 run');
  });

  it('参数表只有 input 与 runId', () => {
    const { tool } = harness();
    const properties = (tool.parameters as { properties?: Record<string, unknown> }).properties;
    expect(Object.keys(properties ?? {}).sort()).toEqual(['input', 'runId']);
  });
});
