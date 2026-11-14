import { describe, expect, it } from 'vitest';
import type { PlanResults, RequestPlan } from '../../../contract/data.js';
import { checkFlow } from '../check.js';
import { createFlowActionRegistry, runFlow } from '../run.js';
import type { FlowDataPort, FlowDefinition, FlowStepEvent } from '../types.js';

const plan: RequestPlan = {
  origin: 'https://oa.example.com',
  loginUrl: 'https://oa.example.com/',
  steps: [
    { name: 'key', request: { method: 'POST', path: '/api/split', contentType: 'form', body: { a: '1' } } },
    { name: 'rows', request: { method: 'POST', path: '/api/rows', body: { key: '{{key}}' } } },
  ],
};

const flow: FlowDefinition = {
  id: 'todo',
  title: '待办',
  steps: [{ id: 'todo', title: '读待办', data: plan }],
};

function base(options: {
  readonly data: FlowDataPort;
  readonly events?: FlowStepEvent[];
  readonly signal?: AbortSignal;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  return {
    flow,
    input: {},
    actions: createFlowActionRegistry(),
    signal: options.signal ?? new AbortController().signal,
    runId: 'run-1',
    workspace: '/tmp/w',
    data: options.data,
    onStep: (event: FlowStepEvent) => options.events?.push(event),
    sleep: options.sleep ?? (async () => {}),
  };
}

const ok: PlanResults = {
  key: { ok: true, data: 'k', elapsedMs: 5 },
  rows: { ok: true, data: [1, 2], elapsedMs: 7 },
};

describe('flow data 步骤', () => {
  it('结果摊平进 steps.<id>，并给长任务一条耗时摘要', async () => {
    const events: FlowStepEvent[] = [];
    const data: FlowDataPort = { plan: async () => ok };
    const result = await runFlow(base({ data, events }));

    expect(result.status).toBe('ok');
    expect(result.steps['todo']).toEqual({ key: 'k', rows: [1, 2] });
    expect(events).toContainEqual(
      expect.objectContaining({ status: 'running', message: expect.stringContaining('读数据：2 跳 12ms') }),
    );
  });

  it('第一处失败就让这一步失败，failedStep 指向 data 步骤', async () => {
    const events: FlowStepEvent[] = [];
    const data: FlowDataPort = {
      plan: async () => ({
        key: { ok: true, data: 'k' },
        rows: { ok: false, error: { code: 'parse', message: '形状不对', pageCode: 'shape' } },
      }),
    };
    const result = await runFlow(base({ data, events }));

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBe('todo');
    expect(result.steps['todo']).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({ status: 'failed', message: expect.stringContaining('第 rows 跳没成（parse）：形状不对') }),
    );
  });

  it('open 可以按步骤覆盖', async () => {
    let seen: { readonly open?: boolean } | undefined;
    const data: FlowDataPort = {
      plan: async (_plan, options) => {
        seen = options;
        return ok;
      },
    };
    const result = await runFlow({
      ...base({ data }),
      flow: { ...flow, steps: [{ id: 'todo', title: '读待办', data: plan, open: false }] },
    });
    expect(result.status).toBe('ok');
    expect(seen?.open).toBe(false);
  });

  it('失败时把后面没跑的步骤也写进错误', async () => {
    const events: FlowStepEvent[] = [];
    const longer: RequestPlan = {
      ...plan,
      steps: [
        ...plan.steps,
        { name: 'write', request: { method: 'POST', path: '/api/write' } },
      ],
    };
    const data: FlowDataPort = {
      plan: async () => ({
        key: { ok: true, data: 'k' },
        rows: { ok: false, error: { code: 'parse', message: '形状不对' } },
        write: { ok: false, error: { code: 'skipped', message: '没跑' } },
      }),
    };
    const result = await runFlow({
      ...base({ data, events }),
      flow: { ...flow, steps: [{ id: 'todo', title: '读待办', data: longer }] },
    });
    expect(result.status).toBe('failed');
    expect(events).toContainEqual(
      expect.objectContaining({ status: 'failed', message: expect.stringContaining('后面 write 没跑') }),
    );
  });

  it('auth 失败发 ctx.need，等一拍后整条计划重试', async () => {
    const events: FlowStepEvent[] = [];
    let calls = 0;
    const data: FlowDataPort = {
      plan: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            key: {
              ok: false,
              error: { code: 'auth', message: '登录信息超时', helpUrl: 'https://oa.example.com/' },
            },
          };
        }
        return ok;
      },
    };
    const result = await runFlow(base({ data, events }));

    expect(result.status).toBe('ok');
    expect(calls).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        status: 'needs-human',
        intervention: expect.objectContaining({
          title: '需要登录',
          actions: [{ kind: 'open-url', url: 'https://oa.example.com/' }],
        }),
      }),
    );
  });

  it('只有 code: auth 才当登录失败，消息里出现 login 不算', async () => {
    const events: FlowStepEvent[] = [];
    const data: FlowDataPort = {
      plan: async () => ({
        key: { ok: true, data: 'k' },
        rows: { ok: false, error: { code: 'parse', message: '引用取不到：login.x', pageCode: 'ref-missing' } },
      }),
    };
    const result = await runFlow(base({ data, events }));
    expect(result.status).toBe('failed');
    expect(events.some((event) => event.status === 'needs-human')).toBe(false);
  });

  it('auth 但没有 loginUrl：直接失败，不是静默重试', async () => {
    const events: FlowStepEvent[] = [];
    const data: FlowDataPort = {
      plan: async () => ({ key: { ok: false, error: { code: 'auth', message: '登录信息超时' } } }),
    };
    const result = await runFlow(base({ data, events }));
    expect(result.status).toBe('failed');
    expect(events.some((event) => event.status === 'needs-human')).toBe(false);
  });

  it('abort 之后返回 stopped，不是 failed', async () => {
    const controller = new AbortController();
    const data: FlowDataPort = {
      plan: (_plan, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    };
    const pending = runFlow(base({ data, signal: controller.signal }));
    controller.abort();
    const result = await pending;
    expect(result.status).toBe('stopped');
  });

  it('运行期坏计划（空 steps）也失败，不静默成功', async () => {
    const bad: FlowDefinition = {
      id: 'bad',
      title: '坏',
      steps: [{ id: 'todo', data: { origin: 'https://oa.example.com', steps: [] } }],
    };
    const result = await runFlow({
      ...base({ data: { plan: async () => ({}) } }),
      flow: bad,
    });
    expect(result.status).toBe('failed');
    expect(String(result.error)).toContain('至少要有一步');
  });

  it('没有数据通道时这一步失败，说清原因', async () => {
    const result = await runFlow({
      ...base({ data: { plan: async () => ok } }),
      data: undefined,
    });
    expect(result.status).toBe('failed');
    expect(String(result.error)).toContain('没有数据通道');
  });
});

describe('flow data 步骤 · 校验', () => {
  it('宿主没有 data 能力时在 check 阶段拒', () => {
    const checked = checkFlow(flow, createFlowActionRegistry(), { data: false });
    expect(checked.ok).toBe(false);
    expect(checked.problems.some((one) => one.problem.includes('没有数据读取能力'))).toBe(true);
  });

  it('坏计划带路径；poll / forEach 直接拒', () => {
    const bad: FlowDefinition = {
      id: 'bad',
      title: '坏',
      steps: [
        {
          id: 'todo',
          data: { ...plan, steps: [{ name: 'a', request: { method: 'GET', path: '' } }] },
          poll: { everyMs: 100, maxMs: 1000, until: { $exists: { $ref: 'steps.a' } } },
          forEach: { over: { $lit: [1] }, as: 'item', max: 1 },
        } as never,
      ],
    };
    const checked = checkFlow(bad, createFlowActionRegistry());
    expect(checked.ok).toBe(false);
    expect(checked.problems.some((one) => one.path.includes('data.steps[0].request.path'))).toBe(true);
    expect(checked.problems.some((one) => one.problem.includes('不支持 poll'))).toBe(true);
    expect(checked.problems.some((one) => one.problem.includes('不支持 forEach'))).toBe(true);
  });
});
