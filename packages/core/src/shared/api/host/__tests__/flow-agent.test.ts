import { describe, expect, it } from 'vitest';
import type { DshHostContext, FlowAgentRequest } from '@dsh-workbench/shared/host';
import { createApprovalGate } from '../approval-gate';
import { createFlowAgentGateway, flowChildDenial } from '../flow/agent';

interface SubagentRecorder {
  readonly runtime: {
    getProvider(name: string): unknown;
    startActivation(spec: Record<string, unknown>): Promise<{
      childId: string;
      name: string;
      result: Promise<{ output: readonly unknown[]; structured?: unknown; stopReason: string }>;
      dispose(): Promise<void>;
    }>;
  };
  readonly calls: Array<Record<string, unknown>>;
  readonly disposed: string[];
}

function subagentsOf(
  options: {
    readonly output?: readonly unknown[];
    readonly structured?: unknown;
    readonly stopReason?: string;
    readonly provider?: string;
  } = {},
): SubagentRecorder {
  const calls: Array<Record<string, unknown>> = [];
  const disposed: string[] = [];
  const provider = options.provider ?? 'spawn';
  return {
    calls,
    disposed,
    runtime: {
      getProvider: (name: string) => (name === provider ? { name } : undefined),
      async startActivation(spec) {
        calls.push(spec);
        const childId = String(spec['childId']);
        return {
          childId,
          name: typeof spec['name'] === 'string' ? spec['name'] : 'agent-1',
          result: Promise.resolve({
            output: options.output ?? [{ type: 'text', text: '结论' }],
            ...(options.structured === undefined ? {} : { structured: options.structured }),
            stopReason: options.stopReason ?? 'completed',
          }),
          async dispose() {
            disposed.push(childId);
          },
        };
      },
    },
  };
}

function contextOf(parts: {
  readonly subagents?: unknown;
  readonly agents?: unknown;
  readonly agentPresets?: unknown;
  readonly agentDefaultModel?: unknown;
}): DshHostContext {
  const services: Record<string, unknown> = {
    subagents: parts.subagents,
    agents: parts.agents,
    agentPresets: parts.agentPresets,
    agentDefaultModel: parts.agentDefaultModel,
  };
  return { get: (name: string) => services[name] } as unknown as DshHostContext;
}

function parentOf(sessionId: string): { readonly session: { readonly id: string } } {
  return { session: { id: sessionId } };
}

const request: FlowAgentRequest = {
  stepId: 'review',
  prompt: '看 diff',
  label: '评审',
  provider: 'deepseek',
  model: 'deepseek-chat',
  preset: 'standard',
  cwd: '/w/x',
  schema: { type: 'object', properties: {} },
};

describe('createFlowAgentGateway：把一步 agent 接到 dsh 的 subagents', () => {
  it('参数照 dsh 的形状传：spawn 后端、caller 投递、模型与模式覆盖、结构化输出', async () => {
    const recorder = subagentsOf({ structured: { verdict: 'go' } });
    const parent = parentOf('s-1');
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: { get: (id: string) => (id === 's-1' ? parent : undefined) },
      }),
    );
    const signal = new AbortController().signal;
    const runner = await gateway.port?.open({ workspace: '/w/a', sessionId: 's-1', signal });
    const result = await runner?.run(request, signal);

    expect(recorder.calls[0]).toMatchObject({
      provider: 'spawn',
      label: '评审',
      delivery: 'caller',
      agentPreset: 'standard',
      cwd: '/w/x',
      agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
      outputSchema: { type: 'object', properties: {} },
      parent,
      signal,
    });
    expect(recorder.calls[0]?.['prompt']).toEqual([{ type: 'text', text: '看 diff' }]);
    expect(typeof recorder.calls[0]?.['childId']).toBe('string');
    expect(result).toMatchObject({ value: { verdict: 'go' }, text: '结论', stopReason: 'completed' });
  });

  it('文本按 text 块拼起来', async () => {
    const recorder = subagentsOf({
      output: [
        { type: 'text', text: '第一段' },
        { type: 'text', text: '第二段' },
      ],
    });
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: { get: () => parentOf('s-1') },
      }),
    );
    const runner = await gateway.port?.open({ workspace: '/w/a', sessionId: 's-1', signal: new AbortController().signal });
    const result = await runner?.run({ stepId: 'review', prompt: '看' }, new AbortController().signal);

    expect(result?.text).toBe('第一段第二段');
  });

  it('停止原因原样带回去，由流程引擎判失败', async () => {
    const recorder = subagentsOf({ stopReason: 'max-tokens' });
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: { get: () => parentOf('s-1') },
      }),
    );
    const runner = await gateway.port?.open({ workspace: '/w/a', sessionId: 's-1', signal: new AbortController().signal });
    const result = await runner?.run({ stepId: 'review', prompt: '看' }, new AbortController().signal);

    expect(result?.stopReason).toBe('max-tokens');
  });

  it('成功与失败都收摊，子会话在跑的时候算这一趟的孩子', async () => {
    const recorder = subagentsOf();
    const parent = parentOf('s-1');
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: { get: () => parent },
      }),
    );
    const runner = await gateway.port?.open({ workspace: '/w/a', sessionId: 's-1', signal: new AbortController().signal });
    const during: boolean[] = [];
    const original = recorder.runtime.startActivation;
    recorder.runtime.startActivation = async (spec) => {
      during.push(gateway.isChild(String(spec['childId'])));
      return original(spec);
    };
    await runner?.run({ stepId: 'review', prompt: '看' }, new AbortController().signal);

    expect(during).toEqual([true]);
    expect(gateway.isChild(String(recorder.calls[0]?.['childId']))).toBe(false);
    expect(recorder.disposed).toHaveLength(1);
  });

  it('没有会话就自建一个 owner，子 agent 挂在它下面，跑完收摊', async () => {
    const recorder = subagentsOf();
    const created: Array<Record<string, unknown>> = [];
    const disposed: number[] = [];
    const owner = { session: { id: 'owner-1' } };
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: {
          get: () => undefined,
          async create(input: Record<string, unknown>) {
            created.push(input);
            return {
              agent: owner,
              async dispose() {
                disposed.push(1);
              },
            };
          },
        },
        agentPresets: { list: async () => [{ id: 'standard' }, { id: 'ptc' }] },
        agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }) },
      }),
    );

    const runner = await gateway.port?.open({
      workspace: '/w/a',
      sessionId: undefined,
      signal: new AbortController().signal,
    });
    await runner?.run({ stepId: 'review', prompt: '看' }, new AbortController().signal);
    await runner?.dispose();

    expect(created[0]).toMatchObject({
      sessionId: expect.any(String),
      meta: { cwd: '/w/a', agentPreset: 'standard' },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-flash' },
    });
    expect(recorder.calls[0]?.['parent']).toBe(owner);
    expect(disposed).toHaveLength(1);
  });

  it('没有 standard 就用名单里第一个能用的模式', async () => {
    const recorder = subagentsOf();
    const created: Array<Record<string, unknown>> = [];
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: {
          get: () => undefined,
          async create(input: Record<string, unknown>) {
            created.push(input);
            return { agent: parentOf('owner-1'), async dispose() {} };
          },
        },
        agentPresets: { list: async () => [{ id: 'ptc' }, { id: 'broken', broken: '没装好' }] },
        agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
      }),
    );

    const runner = await gateway.port?.open({
      workspace: '/w/a',
      sessionId: undefined,
      signal: new AbortController().signal,
    });
    await runner?.dispose();

    expect(created[0]?.['meta']).toMatchObject({ agentPreset: 'ptc' });
  });

  it('一条可用的模式都没有就明确拒绝', async () => {
    const recorder = subagentsOf();
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: {
          get: () => undefined,
          async create() {
            return { agent: parentOf('owner-1'), async dispose() {} };
          },
        },
        agentPresets: { list: async () => [] },
        agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
      }),
    );

    await expect(
      gateway.port?.open({ workspace: '/w/a', sessionId: undefined, signal: new AbortController().signal }),
    ).rejects.toThrow(/没有可用的 agent 模式/);
  });

  it('没有默认模型就当场说清，不推到自建失败里', async () => {
    const recorder = subagentsOf();
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: {
          get: () => undefined,
          async create() {
            throw new Error('不该走到这里');
          },
        },
        agentPresets: { list: async () => [{ id: 'standard' }] },
      }),
    );

    await expect(
      gateway.port?.open({ workspace: '/w/a', sessionId: undefined, signal: new AbortController().signal }),
    ).rejects.toThrow(/没有默认模型/);
  });

  it('自建失败时给一句能看懂的话', async () => {
    const recorder = subagentsOf();
    const gateway = createFlowAgentGateway(
      contextOf({
        subagents: recorder.runtime,
        agents: {
          get: () => undefined,
          async create() {
            throw new Error('no factory');
          },
        },
        agentPresets: { list: async () => [{ id: 'standard' }] },
        agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
      }),
    );

    await expect(
      gateway.port?.open({ workspace: '/w/a', sessionId: undefined, signal: new AbortController().signal }),
    ).rejects.toThrow(/自建一个：no factory/);
  });

  it('会话已经关了也明确拒绝', async () => {
    const recorder = subagentsOf();
    const gateway = createFlowAgentGateway(
      contextOf({ subagents: recorder.runtime, agents: { get: () => undefined } }),
    );

    await expect(
      gateway.port?.open({ workspace: '/w/a', sessionId: 's-9', signal: new AbortController().signal }),
    ).rejects.toThrow(/会话已经关了/);
  });

  it('没装 subagents 的服务就没有端口', () => {
    const gateway = createFlowAgentGateway(contextOf({}));
    expect(gateway.port).toBeUndefined();
    expect(gateway.isChild('x')).toBe(false);
  });

  it('没有 spawn 后端就明确拒绝', async () => {
    const recorder = subagentsOf({ provider: 'other' });
    const gateway = createFlowAgentGateway(
      contextOf({ subagents: recorder.runtime, agents: { get: () => parentOf('s-1') } }),
    );
    const runner = await gateway.port?.open({ workspace: '/w/a', sessionId: 's-1', signal: new AbortController().signal });

    await expect(
      runner?.run({ stepId: 'review', prompt: '看' }, new AbortController().signal),
    ).rejects.toThrow(/没装 spawn/);
  });
});

describe('流程子会话的工具边界', () => {
  const gate = createApprovalGate({
    ctx: contextOf({}),
    toolOf: (name) =>
      name === 'workbench_gitops_set' ? { unit: 'gitops', writes: true } : undefined,
    faceOf: () => undefined,
    declaredNotes: () => new Set<string>(),
    isFlowChild: (sessionId) => sessionId === 'child-1',
  });

  it('问人与再委派一律拒', () => {
    expect(flowChildDenial('ask_user_question')).toContain('不能问人');
    expect(flowChildDenial('subagent')).toContain('不再委派');
    expect(flowChildDenial('workflow')).toContain('编排归流程');
    expect(flowChildDenial('schedule_create')).toContain('排日程');
    expect(flowChildDenial('workbench_diy_install')).toContain('工作台本身');
    expect(flowChildDenial('workbench_gitops_list')).toBeUndefined();
    expect(flowChildDenial('bash')).toBeUndefined();
  });

  it('子会话调写工具被审批门拒，普通会话放行', async () => {
    const denied = await gate(
      { name: 'workbench_gitops_set', agent: { session: { id: 'child-1' } } },
      async () => ({ kind: 'allow' }),
    );
    expect(denied).toEqual({ kind: 'deny', reason: expect.stringContaining('写工具') });

    const asked = await gate(
      { name: 'ask_user_question', agent: { session: { id: 'child-1' } } },
      async () => {
        throw new Error('不该走到下一道闸');
      },
    );
    expect(asked).toEqual({ kind: 'deny', reason: expect.stringContaining('不能问人') });

    let called = false;
    const normal = await gate(
      { name: 'workbench_gitops_list', agent: { session: { id: 's-1' } } },
      async () => {
        called = true;
        return { kind: 'allow' };
      },
    );
    expect(called).toBe(true);
    expect(normal).toEqual({ kind: 'allow' });
  });
});
