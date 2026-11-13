import { describe, expect, it } from 'vitest';
import type { AiToolDefinition } from '@dsh-workbench/shared/host';
import { registerBridgeTool } from '../ai-tools';

interface Registered {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly output: { readonly schema: unknown; render(args: unknown, value: unknown): unknown[] };
  execute(args: unknown, exec: { signal?: AbortSignal }): Promise<unknown>;
}

function registryOf(): { registry: { register(def: Readonly<Record<string, unknown>>): () => void }; defs: Registered[] } {
  const defs: Registered[] = [];
  return {
    defs,
    registry: {
      register: (def) => {
        defs.push(def as unknown as Registered);
        return () => {};
      },
    },
  };
}

const tool: AiToolDefinition = {
  name: 'lookup',
  description: '按合同号查条款',
  parameters: { type: 'object' },
  run: async (args) => ({ echoed: args }),
};

describe('桥接工具', () => {
  it('注册一个工具，名字唯一且带可用子工具清单', () => {
    const { defs, registry } = registryOf();
    const bridge = registerBridgeTool(registry, [tool], 0, undefined);
    expect(defs.length).toBe(1);
    expect(defs[0]?.name).toBe(bridge.name);
    expect(defs[0]?.description).toContain('lookup');
    expect((defs[0]?.parameters['properties'] as Record<string, unknown> & { tool: { enum: string[] } }).tool.enum).toEqual([
      'lookup',
    ]);
  });

  it('调到子工具就把参数交给它', async () => {
    const { defs, registry } = registryOf();
    registerBridgeTool(registry, [tool], 0, undefined);
    const value = await defs[0]?.execute({ tool: 'lookup', args: { no: 'A-1' } }, {});
    expect(value).toEqual({ ok: true, value: { echoed: { no: 'A-1' } } });
  });

  it('子工具名不对回 ok:false，不抛', async () => {
    const { defs, registry } = registryOf();
    registerBridgeTool(registry, [tool], 0, undefined);
    const value = await defs[0]?.execute({ tool: 'nope' }, {});
    expect(value).toMatchObject({ ok: false });
  });

  it('子工具抛错也回 ok:false，错误带回去', async () => {
    const { defs, registry } = registryOf();
    registerBridgeTool(
      registry,
      [{ ...tool, run: async () => { throw new Error('查不到'); } }],
      0,
      undefined,
    );
    const value = await defs[0]?.execute({ tool: 'lookup' }, {});
    expect(value).toEqual({ ok: false, error: '查不到' });
  });

  it('单工具超时以 AiError 抛出', async () => {
    const { defs, registry } = registryOf();
    registerBridgeTool(
      registry,
      [
        {
          ...tool,
          run: async (_args, context) =>
            new Promise((_done, fail) => {
              context.signal.addEventListener('abort', () => fail(new Error('aborted')), { once: true });
            }),
        },
      ],
      5,
      undefined,
    );
    await expect(defs[0]?.execute({ tool: 'lookup' }, {})).rejects.toMatchObject({ code: 'timeout' });
  });

  it('整轮中止时子工具也停', async () => {
    const controller = new AbortController();
    const { defs, registry } = registryOf();
    registerBridgeTool(
      registry,
      [
        {
          ...tool,
          run: async (_args, context) =>
            new Promise((_done, fail) => {
              context.signal.addEventListener('abort', () => fail(new Error('aborted')), { once: true });
            }),
        },
      ],
      0,
      controller.signal,
    );
    const pending = defs[0]?.execute({ tool: 'lookup' }, {});
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'timeout' });
  });
});
