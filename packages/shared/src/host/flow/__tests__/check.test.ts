import { describe, expect, it } from 'vitest';
import { checkFlow } from '../check.js';
import type { FlowDefinition, FlowValue } from '../types.js';

const ref = (path: string): FlowValue => ({ $ref: path });
const lit = (value: unknown): FlowValue => ({ $lit: value });

const actions = (names: readonly string[]) => ({
  has: (name: string) => names.includes(name),
});

describe('checkFlow', () => {
  it('合格流程没有 problems', () => {
    const flow: FlowDefinition = {
      id: 'ok',
      title: '合格',
      steps: [
        { id: 'read', action: 'read' },
        {
          id: 'write',
          action: 'write',
          with: { rows: ref('steps.read.rows') },
          retry: { attempts: 2 },
        },
        {
          id: 'wait',
          action: 'read',
          poll: {
            everyMs: 500,
            maxMs: 10_000,
            until: { $eq: [ref('value.status'), lit('done')] },
          },
        },
      ],
    };

    expect(checkFlow(flow, actions(['read', 'write']))).toEqual({ ok: true, problems: [] });
  });

  it('未知动作、引用未来步骤、无上限轮询都指到路径', () => {
    const flow: FlowDefinition = {
      id: 'bad',
      title: '坏',
      steps: [
        { id: 'a', action: 'missing' },
        { id: 'b', action: 'read', with: { x: ref('steps.c.y') } },
        {
          id: 'c',
          action: 'read',
          poll: {
            everyMs: 10,
            maxMs: 5,
            until: { $eq: [ref('value.x'), lit(1)] },
          },
        },
      ],
    };

    const result = checkFlow(flow, actions(['read']));
    const paths = result.problems.map((problem) => problem.path);

    expect(result.ok).toBe(false);
    expect(paths).toContain('steps[0].action');
    expect(paths).toContain('steps[1].with.x');
    expect(paths).toContain('steps[2].poll.everyMs');
    expect(paths).toContain('steps[2].poll.maxMs');
  });

  it('item 只在 forEach 步骤里', () => {
    const flow: FlowDefinition = {
      id: 'bad',
      title: '坏',
      steps: [
        { id: 'a', action: 'read', with: { x: ref('item.id') } },
        {
          id: 'b',
          action: 'read',
          forEach: { over: { $lit: [1] }, as: 'item', max: 2 },
          with: { x: ref('item.id') },
        },
      ],
    };

    const paths = checkFlow(flow, actions(['read'])).problems.map((problem) => problem.path);
    expect(paths).toContain('steps[0].with.x');
    expect(paths).not.toContain('steps[1].with.x');
  });

  it('forEach 里可以 poll；maxMs=0 与 onTimeout=continue 合法', () => {
    const flow: FlowDefinition = {
      id: 'ok',
      title: '合格',
      steps: [
        {
          id: 'a',
          action: 'read',
          forEach: { over: { $lit: [1] }, as: 'item', max: 2 },
          poll: {
            everyMs: 100,
            maxMs: 0,
            onTimeout: 'continue',
            until: { $eq: [ref('value.x'), ref('item.id')] },
          },
        },
      ],
    };

    expect(checkFlow(flow, actions(['read']))).toEqual({ ok: true, problems: [] });
  });

  it('子流程也照查，路径带 steps[i].flow', () => {
    const flow: FlowDefinition = {
      id: 'outer',
      title: '外层',
      steps: [
        {
          id: 'merge',
          title: '合并',
          with: { env: ref('in.env') },
          flow: {
            id: 'merge',
            title: '合并',
            steps: [{ id: 'mr', action: 'missing' }],
          },
        },
      ],
    };

    expect(checkFlow(flow, actions([])).problems.map((problem) => problem.path)).toContain(
      'steps[0].flow.steps[0].action',
    );
  });

  it('stopWhen 可以引用任意步骤，引用不存在的步骤会报', () => {
    const good: FlowDefinition = {
      id: 'good',
      title: '好',
      stopWhen: { $exists: ref('steps.b.done') },
      steps: [
        { id: 'a', action: 'read' },
        { id: 'b', action: 'read' },
      ],
    };
    const bad: FlowDefinition = {
      id: 'bad',
      title: '坏',
      stopWhen: { $exists: ref('steps.nope.done') },
      steps: [{ id: 'a', action: 'read' }],
    };

    expect(checkFlow(good, actions(['read'])).ok).toBe(true);
    expect(checkFlow(bad, actions(['read'])).problems.map((problem) => problem.path)).toContain(
      'stopWhen.$exists',
    );
  });

  it('target 不能引用还没跑的步骤', () => {
    const flow: FlowDefinition = {
      id: 'bad',
      title: '坏',
      target: ref('steps.a.x'),
      steps: [{ id: 'a', action: 'read' }],
    };

    expect(checkFlow(flow, actions(['read'])).problems.map((problem) => problem.path)).toContain(
      'target',
    );
  });
});
