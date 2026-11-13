import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { createAiPort } from '@dsh-workbench/shared/host';
import { mountUnits } from '@/kernel/host/mount-units';
import { createDshAi } from '@/shared/api/host/ai-adapter';
import { hostOf, manifest } from './unit-face-helpers';

function provisionOf(plan: { readonly provision?: unknown }): (() => Promise<unknown>) | undefined {
  const raw = plan.provision as unknown;
  if (raw === undefined) return undefined;
  if (typeof raw === 'function') return async () => (raw as (request: unknown) => Promise<unknown>)({});
  const holder = raw as { handle?(request: unknown): Promise<unknown> };
  return async () => (await holder.handle?.({}));
}

function ctxOf(): DshHostContext {
  return {
    get: (name: string) => {
      if (name === 'llm') {
        return {
          stream: () => {
            const chunks = [
              { type: 'text-delta', text: '模块看到了模型' },
              { type: 'finish', reason: { kind: 'stop' } },
            ];
            return (async function* () {
              for (const chunk of chunks) yield chunk;
            })();
          },
        };
      }
      if (name === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      }
      if (name === 'attachments') {
        return { saveImage: async () => ({ attachmentId: 'a' }) };
      }
      return undefined;
    },
  } as unknown as DshHostContext;
}

describe('deps.ai 真的到得了模块里', () => {
  it('模块在 mount 里调 deps.ai.ask，拿回模型的一句话', async () => {
    let answer = '';
    let imageOk = false;
    const ai = createDshAi(ctxOf(), () => undefined);
    const host = hostOf(manifest('demo-ai', { inject: [] }), (deps) => {
      expect(deps.ai).toBeDefined();
      imageOk = deps.ai?.supports('images') === true;
      return {
        routes: {},
        registerTools: () => [],
        async provision() {
          answer = (await deps.ai?.ask({ prompt: '你好' })) ?? '';
          return { ok: true };
        },
      } as never;
    });
    const plan = mountUnits([host], { ctx: ctxOf(), manifests: () => [], ai });
    expect(plan.mounted.length).toBe(1);
    await provisionOf(plan)?.();
    expect(answer).toBe('模块看到了模型');
    expect(imageOk).toBe(true);
  });

  it('没给 ai 时 deps.ai 是 undefined（模块自己决定怎么降级）', () => {
    let hasAi = true;
    const host = hostOf(manifest('demo-null', { inject: [] }), (deps) => {
      hasAi = deps.ai !== undefined;
      return { routes: {}, registerTools: () => [] };
    });
    mountUnits([host], { ctx: ctxOf(), manifests: () => [] });
    expect(hasAi).toBe(false);
  });

  it('换掉实现：registerAdapter 之后模块拿到的是新的那份', async () => {
    const ai = createAiPort({
      name: 'first',
      capabilities: ['text'],
      complete: async () => ({ text: '原始' }),
    });
    ai.registerAdapter({
      name: 'second',
      capabilities: ['text'],
      complete: async () => ({ text: '换过' }),
    });
    let answer = '';
    const host = hostOf(manifest('demo-swap', { inject: [] }), (deps) => ({
      routes: {},
      registerTools: () => [],
      async provision() {
        answer = (await deps.ai?.ask({ prompt: 'x' })) ?? '';
        return { ok: true };
      },
    }) as never);
    const plan = mountUnits([host], { ctx: ctxOf(), manifests: () => [], ai });
    await provisionOf(plan)?.();
    expect(answer).toBe('换过');
  });
});
