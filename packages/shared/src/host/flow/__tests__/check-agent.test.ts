import { describe, expect, it } from 'vitest';
import { createFlowHost } from '../kit.js';
import { checkFlow } from '../check.js';
import type { FlowActionRegistry, FlowDefinition, FlowStep } from '../types.js';

const ref = (path: string): { $ref: string } => ({ $ref: path });
const lit = (value: unknown): { $lit: unknown } => ({ $lit: value });

function actionsOf(): Pick<FlowActionRegistry, 'has'> {
  return { has: () => false };
}

function flowOf(steps: readonly FlowStep[]): FlowDefinition {
  return { id: 'sample', title: '样例', steps };
}

function problemsOf(flow: FlowDefinition, agents?: boolean): readonly string[] {
  const check = agents === undefined ? checkFlow(flow, actionsOf()) : checkFlow(flow, actionsOf(), { agents });
  return check.problems.map((problem) => `${problem.path}: ${problem.problem}`);
}

describe('checkFlow：agent 节点的静态口径', () => {
  it('prompt 必须是字符串', () => {
    const problems = problemsOf(flowOf([{ id: 'a', agent: { prompt: lit(42) } }]));
    expect(problems.some((problem) => problem.includes('steps[0].agent.prompt'))).toBe(true);
  });

  it('prompt 引用后面的步骤要报', () => {
    const problems = problemsOf(
      flowOf([
        { id: 'a', agent: { prompt: ref('steps.later') } },
        { id: 'later', action: 'x' } as unknown as FlowStep,
      ]),
    );
    expect(problems.some((problem) => problem.includes('还没出现'))).toBe(true);
  });

  it('schema 必须是对象根', () => {
    const problems = problemsOf(
      flowOf([
        { id: 'a', agent: { prompt: lit('看'), schema: { type: 'string' } } },
      ]),
    );
    expect(problems.some((problem) => problem.includes('对象根'))).toBe(true);
  });

  it('运行时没有 agent 通道就报', () => {
    const problems = problemsOf(flowOf([{ id: 'a', agent: { prompt: lit('看') } }]), false);
    expect(problems.some((problem) => problem.includes('没有 agent 能力'))).toBe(true);
    expect(problemsOf(flowOf([{ id: 'a', agent: { prompt: lit('看') } }]), true)).toEqual([]);
  });

  it('子流程里的 agent 节点也照查', () => {
    const problems = problemsOf(
      flowOf([
        {
          id: 'sub',
          flow: flowOf([{ id: 'inner', agent: { prompt: lit(7) } }]),
        } as unknown as FlowStep,
      ]),
    );
    expect(problems.some((problem) => problem.includes('steps[0].flow.steps[0].agent.prompt'))).toBe(
      true,
    );
  });

  it('agent 步骤的 retry 与 forEach 边界照旧', () => {
    const problems = problemsOf(
      flowOf([
        {
          id: 'a',
          agent: { prompt: lit('看') },
          retry: { attempts: 9 },
          forEach: { over: { $lit: [] }, as: 'item', max: 99 },
        },
      ]),
    );
    expect(problems.some((problem) => problem.includes('retry.attempts'))).toBe(true);
    expect(problems.some((problem) => problem.includes('forEach.max'))).toBe(true);
  });

  it('forEach 里不给 agent.name', () => {
    const problems = problemsOf(
      flowOf([
        {
          id: 'a',
          agent: { prompt: ref('item'), name: 'reviewer' },
          forEach: { over: { $lit: ['x'] }, as: 'item', max: 1 },
        },
      ]),
    );
    expect(problems.some((problem) => problem.includes('agent.name'))).toBe(true);
  });

  it('运行期塞进来的 poll 要报', () => {
    const problems = problemsOf(
      flowOf([
        {
          id: 'a',
          agent: { prompt: lit('看') },
          poll: { everyMs: 1000, maxMs: 5000, until: { $exists: ref('value') } },
        } as unknown as FlowStep,
      ]),
    );
    expect(problems.some((problem) => problem.includes('不支持 poll'))).toBe(true);
  });

  it('有 agent 端口时同一份流程过关', () => {
    const host = createFlowHost({
      agents: {
        async open() {
          throw new Error('不该开');
        },
      },
    });
    const check = host.check(
      flowOf([
        {
          id: 'a',
          title: '评审',
          agent: { prompt: lit('看 diff'), schema: { type: 'object', properties: {} } },
        },
      ]),
      host.createActions(),
    );
    expect(check).toEqual({ ok: true, problems: [] });
  });
});
