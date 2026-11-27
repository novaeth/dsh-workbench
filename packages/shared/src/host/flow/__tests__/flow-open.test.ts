import { describe, expect, it } from 'vitest';
import { createFlowHost } from '../kit.js';
import type { FlowDefinition, FlowStepEvent } from '../types.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const flow: FlowDefinition = {
  id: 'chart',
  title: '图',
  steps: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }],
};

function openOf(definition: FlowDefinition = flow) {
  const events: FlowStepEvent[] = [];
  const session = createFlowHost().open({
    flow: definition,
    input: {},
    onStep: (event) => events.push(event),
  });
  return { session, events };
}

describe('open：引擎不执行步骤，由外部逐步推进', () => {
  it('★★ 停 → 推 → 再停 → 再推，直到走完；结果按步骤记下', async () => {
    const { session, events } = openOf();

    expect(session.current()).toEqual({ index: 0, stepId: 'a', title: 'A' });
    expect(session.provide('b', 1).ok).toBe(false);
    await tick();
    expect(session.provide('a', { go: true }).ok).toBe(true);
    await tick();
    expect(session.current()?.stepId).toBe('b');
    session.provide('b', 2);
    await tick();
    session.provide('c', 3);

    const result = await session.result;

    expect(result.status).toBe('ok');
    expect(result.steps).toEqual({ a: { go: true }, b: 2, c: 3 });
    expect(events.map((one) => `${one.stepId}:${one.status}`)).toEqual([
      'a:running',
      'b:running',
      'c:running',
    ]);
    expect(session.current()).toBeNull();
  });

  it('★ 条件不成立就跳过，进度事件里是 skipped', async () => {
    const gated: FlowDefinition = {
      id: 'gated',
      title: '带条件',
      steps: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', when: { $eq: [{ $ref: 'steps.a.go' }, { $lit: true }] } },
        { id: 'c', title: 'C' },
      ],
    };
    const { session, events } = openOf(gated);

    session.provide('a', { go: false });
    await tick();

    expect(session.current()?.stepId).toBe('c');
    expect(events.map((one) => `${one.stepId}:${one.status}`)).toContain('b:skipped');
  });

  it('★ 中止立刻结束，结果状态是 stopped，未推进的步骤不执行', async () => {
    const { session } = openOf();

    session.abort();
    const result = await session.result;

    expect(result.status).toBe('stopped');
    expect(result.steps).toEqual({});
    expect(session.provide('a', 1).ok).toBe(false);
  });

  it('★ 外部推进的流程不许带执行体，校验点名那一步', () => {
    const host = createFlowHost();
    const withAction: FlowDefinition = {
      id: 'bad',
      title: '坏图',
      steps: [{ id: 'a', title: 'A', action: 'read' }],
    };

    const checked = host.check(withAction, { has: () => true }, { external: true });

    expect(checked.ok).toBe(false);
    expect(checked.problems.map((one) => one.path)).toContain('steps[0]');
  });
});
