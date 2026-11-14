import { describe, expect, it } from 'vitest';
import type { AiPart, DshHostContext } from '@dsh-workbench/shared/host';
import { createDshAi, createDshAiAdapter } from '../ai-adapter';

interface Saved {
  readonly data: Uint8Array;
  readonly mediaType: string;
  readonly name?: string;
}

function ctxOf(options: {
  readonly chunks?: readonly unknown[];
  readonly withAttachments?: boolean;
  readonly withLlm?: boolean;
  readonly selection?: { provider: string; model: string } | null;
} = {}): { ctx: DshHostContext; saved: Saved[]; seen: Record<string, unknown>[] } {
  const saved: Saved[] = [];
  const seen: Record<string, unknown>[] = [];
  const chunks = options.chunks ?? [
    { type: 'text-delta', text: '好的' },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
  const ctx = {
    get: (name: string) => {
      if (name === 'llm') {
        if (options.withLlm === false) return undefined;
        return {
          stream: (request: Record<string, unknown>) => {
            seen.push(request);
            return (async function* () {
              for (const chunk of chunks) yield chunk;
            })();
          },
        };
      }
      if (name === 'attachments') {
        return options.withAttachments === false
          ? undefined
          : {
              saveImage: async (input: Saved) => {
                saved.push(input);
                return { attachmentId: `a-${String(saved.length)}` };
              },
            };
      }
      if (name === 'subagents' || name === 'agents') {
        return {};
      }
      if (name === 'agentDefaultModel') {
        return {
          currentSelection: () =>
            options.selection === null ? undefined : (options.selection ?? { provider: 'p', model: 'm' }),
        };
      }
      return undefined;
    },
  } as unknown as DshHostContext;
  return { ctx, saved, seen };
}

const image: AiPart = { kind: 'image', data: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg', name: 'p1.jpg' };

describe('dsh 适配器的 agent 面', () => {
  const agentPort = (run: (request: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>) =>
    ({
      open: async () => ({
        run,
        dispose: async () => {},
      }),
    }) as never;

  it('把 tools.allow/deny 变成 toolFilter', async () => {
    const seen: Record<string, unknown>[] = [];
    const { ctx } = ctxOf();
    const ai = createDshAi(ctx, () =>
      agentPort(async (request) => {
        seen.push(request);
        return { text: 'ok', childId: 'c', stopReason: 'completed' };
      }),
    );
    await ai.agent({ prompt: 'x', agent: { tools: { allow: ['read'], deny: ['shell'] } } });
    expect(seen[0]?.['toolFilter']).toEqual({ allow: ['read'], deny: ['shell'] });
  });

  it('onEvent 至少给出开始与结论两条', async () => {
    const events: { kind: string }[] = [];
    const { ctx } = ctxOf();
    const ai = createDshAi(ctx, () =>
      agentPort(async () => ({ text: '结论', childId: 'c', stopReason: 'completed' })),
    );
    await ai.agent({ prompt: 'x', agent: { onEvent: (event) => events.push(event) } });
    expect(events.map((one) => one.kind)).toEqual(['step', 'text']);
  });

  it('还没实现的配置直接说 unsupported-option，不装作生效', async () => {
    const { ctx } = ctxOf();
    const ai = createDshAi(ctx, () => agentPort(async () => ({ text: 'ok', childId: 'c', stopReason: 'completed' })));
    await expect(ai.agent({ prompt: 'x', agent: { maxTurns: 3 } })).rejects.toMatchObject({
      code: 'unsupported-option',
    });
  });

  it('带图片时把图交给子 agent，而不是报不支持', async () => {
    const seen: Record<string, unknown>[] = [];
    const { ctx } = ctxOf();
    const ai = createDshAi(ctx, () =>
      agentPort(async (request) => {
        seen.push(request);
        return { text: 'ok', childId: 'c', stopReason: 'completed' };
      }),
    );
    const photo = new Uint8Array([1, 2, 3]);
    await ai.agent({ prompt: '看一眼', images: [{ data: photo, mediaType: 'image/jpeg', name: 'p1.jpg' }] });
    expect(seen[0]?.['images']).toEqual([{ data: photo, mediaType: 'image/jpeg', name: 'p1.jpg' }]);
  });

  it('budget.ms 超了就真的中止，报 budget-exceeded', async () => {
    const { ctx } = ctxOf();
    const ai = createDshAi(ctx, () =>
      agentPort(
        async (_request, signal) =>
          new Promise((_done, fail) => {
            signal.addEventListener('abort', () => fail(new Error('aborted')), { once: true });
          }),
      ),
    );
    await expect(ai.agent({ prompt: 'x', agent: { budget: { ms: 5 } } })).rejects.toMatchObject({
      code: 'budget-exceeded',
    });
  });
});

describe('dsh 适配器', () => {
  it('文字进内容块，模型与温度按请求给', async () => {
    const { ctx, seen } = ctxOf();
    const adapter = createDshAiAdapter(ctx, () => undefined);
    const done = await adapter.complete({ parts: [{ kind: 'text', text: '你好' }], temperature: 0.2 });
    expect(done.text).toBe('好的');
    expect(seen[0]?.['temperature']).toBe(0.2);
    expect((seen[0]?.['messages'] as { content: unknown[] }[])[0]?.content).toEqual([{ type: 'text', text: '你好' }]);
  });

  it('图片先存附件再把引用放进内容块（不是 image_url）', async () => {
    const { ctx, saved, seen } = ctxOf();
    const adapter = createDshAiAdapter(ctx, () => undefined);
    await adapter.complete({ parts: [{ kind: 'text', text: '看图' }, image] });
    expect(saved.length).toBe(1);
    expect(saved[0]?.mediaType).toBe('image/jpeg');
    const blocks = (seen[0]?.['messages'] as { content: unknown[] }[])[0]?.content ?? [];
    expect(blocks[1]).toEqual({ type: 'image', attachment: { attachmentId: 'a-1' } });
  });

  it('没有附件服务时给图就报 unsupported-input', async () => {
    const { ctx } = ctxOf({ withAttachments: false });
    const adapter = createDshAiAdapter(ctx, () => undefined);
    await expect(adapter.complete({ parts: [image] })).rejects.toMatchObject({ code: 'unsupported-input' });
  });

  it('没有模型时给 no-model', async () => {
    const { ctx } = ctxOf({ selection: null });
    const port = createDshAi(ctx, () => undefined);
    await expect(port.ask({ prompt: 'x' })).rejects.toMatchObject({ code: 'no-model' });
  });

  it('finish 是 error 时算 provider 失败', async () => {
    const { ctx } = ctxOf({ chunks: [{ type: 'finish', reason: { kind: 'error' } }] });
    const port = createDshAi(ctx, () => undefined);
    await expect(port.ask({ prompt: 'x' })).rejects.toMatchObject({ code: 'provider' });
  });

  it('能力按依赖如实给：有附件才有 images', () => {
    expect(createDshAiAdapter(ctxOf().ctx, () => undefined).capabilities).toContain('images');
    expect(createDshAiAdapter(ctxOf({ withAttachments: false }).ctx, () => undefined).capabilities).not.toContain(
      'images',
    );
  });

  it('没有模型端口时能力里没有 text', () => {
    expect(createDshAiAdapter(ctxOf({ withLlm: false }).ctx, () => undefined).capabilities).not.toContain('text');
  });
});
