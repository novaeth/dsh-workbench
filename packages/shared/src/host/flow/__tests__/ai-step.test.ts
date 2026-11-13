import { describe, expect, it } from 'vitest';
import { checkFlow } from '../check.js';
import { createFlowActionRegistry, runFlow } from '../run.js';
import type { AiPort } from '../../ai/port.js';
import type { FlowDefinition, FlowValue } from '../types.js';

const ref = (path: string): FlowValue => ({ $ref: path });
const lit = (value: unknown): FlowValue => ({ $lit: value });
const actions = createFlowActionRegistry();
const registry = { has: (name: string) => actions.has(name) };

function fakeAi(answers: Record<string, unknown>): AiPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    version: 1,
    supports: () => true,
    registerAdapter: () => () => {},
    ask: async (request) => {
      asked.push(request.prompt);
      return String(answers[request.prompt] ?? 'ok');
    },
    askRich: async (request) => ({ text: String(answers[request.prompt] ?? 'ok') }),
    askJson: async (request) => {
      asked.push(request.prompt);
      return answers[request.prompt] as never;
    },
    agent: async () => 'agent',
  };
}

function flowOf(steps: FlowDefinition['steps']): FlowDefinition {
  return { id: 'ai', title: '模型步骤', steps };
}

describe('流程里的模型步骤', () => {
  it('合格：prompt 是字面量，schema 是对象根', () => {
    const checked = checkFlow(
      flowOf([
        {
          id: 'review',
          ai: { prompt: lit('看看这份'), schema: { type: 'object', properties: {} } },
        },
      ]),
      registry,
      { ai: true },
    );
    expect(checked.ok).toBe(true);
  });

  it('prompt 不是字符串 ⇒ 报错', () => {
    const checked = checkFlow(flowOf([{ id: 'r', ai: { prompt: lit(42) } }]), registry, { ai: true });
    expect(checked.ok).toBe(false);
    expect(checked.problems[0]?.path).toBe('steps[0].ai.prompt');
  });

  it('schema 不是对象根 ⇒ 报错', () => {
    const checked = checkFlow(
      flowOf([{ id: 'r', ai: { prompt: lit('x'), schema: { type: 'array' } } }]),
      registry,
      { ai: true },
    );
    expect(checked.ok).toBe(false);
  });

  it('这一份运行时没有模型 ⇒ 起跑前就说', () => {
    const checked = checkFlow(flowOf([{ id: 'r', ai: { prompt: lit('x') } }]), registry, { ai: false });
    expect(checked.ok).toBe(false);
  });

  it('跑起来：结果进 steps，文本步骤取返回值', async () => {
    const ai = fakeAi({ '看看这份': '结论在这里' });
    const result = await runFlow({
      flow: flowOf([{ id: 'r', title: '初审', ai: { prompt: lit('看看这份') } }]),
      input: {},
      actions,
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w',
      ai,
      onStep: () => {},
    });
    expect(result.status).toBe('ok');
    expect(result.steps['r']).toBe('结论在这里');
    expect(ai.asked).toEqual(['看看这份']);
  });

  it('给了 schema 就取对象', async () => {
    const ai = fakeAi({ q: { verdict: 'pass' } });
    const result = await runFlow({
      flow: flowOf([
        { id: 'r', ai: { prompt: lit('q'), schema: { type: 'object', properties: { verdict: { type: 'string' } } } } },
      ]),
      input: {},
      actions,
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w',
      ai,
      onStep: () => {},
    });
    expect(result.steps['r']).toEqual({ verdict: 'pass' });
  });

  it('引用前面的结果当提示词', async () => {
    const ai = fakeAi({ '材料：A': 'ok' });
    const result = await runFlow({
      flow: flowOf([
        { id: 'fetch', action: 'noop' },
        { id: 'r', ai: { prompt: ref('steps.fetch') } },
      ]),
      input: {},
      actions,
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w',
      ai,
      onStep: () => {},
    });
    expect(result.status).toBe('failed');
  });

  it('这一趟没有模型通道 ⇒ 跑到这一步才说', async () => {
    const result = await runFlow({
      flow: flowOf([{ id: 'r', ai: { prompt: lit('x') } }]),
      input: {},
      actions,
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w',
      onStep: () => {},
    });
    expect(result.status).toBe('failed');
  });

  it('图片求值成字符串数组交给端口', async () => {
    const seen: unknown[] = [];
    const ai = {
      ...fakeAi({ '看图': 'ok' }),
      ask: async (request: { prompt: string; images?: readonly string[] }) => {
        seen.push(request.images);
        return 'ok';
      },
    } as unknown as AiPort;
    await runFlow({
      flow: flowOf([{ id: 'r', ai: { prompt: lit('看图'), images: lit(['data:image/png;base64,AA==']) } }]),
      input: {},
      actions,
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w',
      ai,
      onStep: () => {},
    });
    expect(seen[0]).toEqual(['data:image/png;base64,AA==']);
  });
});
