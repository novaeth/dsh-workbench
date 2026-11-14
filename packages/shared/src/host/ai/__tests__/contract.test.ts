import { describe, expect, it } from 'vitest';
import type { AiAdapter, AiAgentResult, AiCompleteRequest, AiCompleteResult } from '../adapter.js';
import { createAiPort } from '../port.js';
import { problemsOf } from '../schema.js';
import { isAiError, type AgentOptions, type JsonSchema } from '../types.js';

interface Harness {
  readonly adapter: AiAdapter & {
    calls: AiCompleteRequest[];
    agents: { parts: unknown; agent: AgentOptions }[];
    reply: (request: AiCompleteRequest) => string | Promise<string>;
  };
}

function harness(options: { capabilities?: AiAdapter['capabilities']; reply?: (r: AiCompleteRequest) => string } = {}): Harness {
  const calls: AiCompleteRequest[] = [];
  const agents: { parts: unknown; agent: AgentOptions }[] = [];
  const reply = options.reply ?? (() => 'ok');
  const adapter = {
    name: 'fake',
    capabilities: options.capabilities ?? (['text', 'images', 'agent'] as const),
    calls,
    agents,
    reply: (request: AiCompleteRequest) => reply(request),
    async complete(request: AiCompleteRequest): Promise<AiCompleteResult> {
      calls.push(request);
      const text = await reply(request);
      return { text, model: { provider: 'fake', model: 'm' } };
    },
    async runAgent(request: { parts: unknown; agent: AgentOptions }): Promise<AiAgentResult> {
      agents.push({ parts: request.parts, agent: request.agent });
      return { text: 'agent-ok', childId: 'c-1', stopReason: 'completed', turns: 2, toolCalls: 1 };
    },
  };
  return { adapter };
}

const SCHEMA: JsonSchema = {
  type: 'object',
  required: ['verdict'],
  properties: { verdict: { type: 'string' } },
};

export function aiContractTests(makePort: (h: Harness) => ReturnType<typeof createAiPort> = (h) => createAiPort(h.adapter)): void {
  describe('ai 契约', () => {
    it('ask 永远返回字符串', async () => {
      const h = harness();
      const text = await makePort(h).ask({ prompt: '你好' });
      expect(typeof text).toBe('string');
      expect(text).toBe('ok');
    });

    it('ask 把提示词原样交给适配器，且不发图片时只有一截文字', async () => {
      const h = harness();
      await makePort(h).ask({ prompt: '原样' });
      expect(h.adapter.calls[0]?.parts).toEqual([{ kind: 'text', text: '原样' }]);
    });

    it('图片三种给法都归一化成一截 image', async () => {
      const h = harness();
      const png = new Uint8Array([137, 80, 78, 71]);
      await makePort(h).ask({
        prompt: 'x',
        images: [
          'data:image/png;base64,' + Buffer.from(png).toString('base64'),
          { data: png, mediaType: 'image/jpeg', name: 'p.jpg' },
          png,
        ],
      });
      const parts = h.adapter.calls[0]?.parts ?? [];
      expect(parts.filter((one) => one.kind === 'image').length).toBe(3);
    });

    it('不认识的图片类型抛 unsupported-input', async () => {
      const h = harness();
      await expect(makePort(h).ask({ prompt: 'x', images: ['data:image/tiff;base64,AA=='] })).rejects.toSatisfy(
        (error: unknown) => isAiError(error) && error.code === 'unsupported-input',
      );
    });

    it('模型不吃图片时抛 unsupported-input，而不是把图丢掉', async () => {
      const h = harness({ capabilities: ['text'] });
      await expect(
        makePort(h).ask({ prompt: 'x', images: ['data:image/png;base64,AA=='] }),
      ).rejects.toSatisfy((error: unknown) => isAiError(error) && error.code === 'unsupported-input');
    });

    it('askJson 解析出对象', async () => {
      const h = harness({ reply: () => '{"verdict":"pass"}' });
      await expect(makePort(h).askJson({ prompt: 'x', schema: SCHEMA })).resolves.toEqual({ verdict: 'pass' });
    });

    it('askJson 把 schema 描述附在提示词末尾', async () => {
      const h = harness({ reply: () => '{"verdict":"pass"}' });
      await makePort(h).askJson({ prompt: '看这份合同', schema: SCHEMA });
      const first = h.adapter.calls[0]?.parts[0];
      const text = first?.kind === 'text' ? first.text : '';
      expect(text.startsWith('看这份合同')).toBe(true);
      expect(text).toContain('JSON Schema');
      expect(text).toContain('"verdict"');
    });

    it('askJson 剥掉代码块围栏', async () => {
      const h = harness({ reply: () => '```json\n{"verdict":"pass"}\n```' });
      await expect(makePort(h).askJson({ prompt: 'x', schema: SCHEMA })).resolves.toEqual({ verdict: 'pass' });
    });

    it('askJson 第一次不合 schema 会重试一次', async () => {
      let count = 0;
      const h = harness({
        reply: () => {
          count += 1;
          return count === 1 ? '{"nope":1}' : '{"verdict":"ok"}';
        },
      });
      await expect(makePort(h).askJson({ prompt: 'x', schema: SCHEMA })).resolves.toEqual({ verdict: 'ok' });
      expect(count).toBe(2);
    });

    it('askJson 两次都不合 schema 抛 schema-mismatch 且带上原始输出', async () => {
      const h = harness({ reply: () => '不是 JSON' });
      await expect(makePort(h).askJson({ prompt: 'x', schema: SCHEMA })).rejects.toSatisfy(
        (error: unknown) => isAiError(error) && error.code === 'schema-mismatch' && typeof error.details?.['raw'] === 'string',
      );
    });

    it('已经中止的信号立刻抛 aborted', async () => {
      const h = harness();
      const controller = new AbortController();
      controller.abort();
      await expect(makePort(h).ask({ prompt: 'x', signal: controller.signal })).rejects.toSatisfy(
        (error: unknown) => isAiError(error) && error.code === 'aborted',
      );
      expect(h.adapter.calls.length).toBe(0);
    });

    it('askRich 带回耗时与模型', async () => {
      const h = harness();
      const result = await makePort(h).askRich({ prompt: 'x' });
      expect(result.text).toBe('ok');
      expect(result.model).toEqual({ provider: 'fake', model: 'm' });
      expect(typeof result.elapsedMs).toBe('number');
    });

    it('agent 不可用时抛 unsupported-option', async () => {
      const h = harness({ capabilities: ['text'] });
      await expect(makePort(h).agent({ prompt: 'x' })).rejects.toSatisfy(
        (error: unknown) => isAiError(error) && error.code === 'unsupported-option',
      );
    });

    it('agent 把配置原样交给适配器', async () => {
      const h = harness();
      const options: AgentOptions = { maxTurns: 3, tools: { allow: ['read'] } };
      await expect(makePort(h).agent({ prompt: 'x', agent: options })).resolves.toBe('agent-ok');
      expect(h.adapter.agents[0]?.agent).toEqual(options);
    });

    it('agent 拿得到文字，且图片当成内容交过去', async () => {
      const h = harness();
      const port = makePort(h);
      const text = await port.agent({
        prompt: '看一眼',
        images: ['data:image/png;base64,AA=='],
        agent: { tools: { allow: ['read'] } },
      });
      expect(text).toBe('agent-ok');
      const parts = h.adapter.agents[0]?.parts as readonly { kind: string }[];
      expect(parts.filter((one) => one.kind === 'image').length).toBe(1);
    });

    it('agent 带 schema：合格才回，回的是那个对象的 JSON', async () => {
      const h = harness();
      h.adapter.runAgent = async () => ({ text: '{"ok":true}', value: { ok: true }, childId: 'c', stopReason: 'completed', turns: 1, toolCalls: 0 });
      const port = createAiPort(h.adapter);
      const text = await port.agent({
        prompt: 'x',
        schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      });
      expect(JSON.parse(text)).toEqual({ ok: true });
    });

    it('agent 带 schema 但结论不合格 → schema-mismatch，不悄悄丢掉', async () => {
      const h = harness();
      h.adapter.runAgent = async () => ({ text: '乱说', childId: 'c', stopReason: 'completed', turns: 1, toolCalls: 0 });
      const port = createAiPort(h.adapter);
      await expect(
        port.agent({ prompt: 'x', schema: { type: 'object', required: ['ok'], properties: {} } }),
      ).rejects.toSatisfy((error: unknown) => isAiError(error) && error.code === 'schema-mismatch');
    });

    it('实现没有 runAgent 时 agent 直接说 unsupported-option', async () => {
      const port = createAiPort({
        name: 'text-only',
        capabilities: ['text'],
        complete: async () => ({ text: 'x' }),
      });
      await expect(port.agent({ prompt: 'x' })).rejects.toSatisfy(
        (error: unknown) => isAiError(error) && error.code === 'unsupported-option',
      );
    });

    it('registerAdapter 换掉实现，disposer 换回来', async () => {
      const h = harness();
      const port = makePort(h);
      const dispose = port.registerAdapter({
        name: 'other',
        capabilities: ['text'],
        complete: async () => ({ text: 'other' }),
      });
      await expect(port.ask({ prompt: 'x' })).resolves.toBe('other');
      dispose();
      await expect(port.ask({ prompt: 'x' })).resolves.toBe('ok');
    });

    it('supports 如实反映能力', () => {
      const h = harness({ capabilities: ['text'] });
      const port = makePort(h);
      expect(port.supports('text')).toBe(true);
      expect(port.supports('images')).toBe(false);
    });

    it('provider 报错翻成 provider 码', async () => {
      const port = createAiPort({
        name: 'boom',
        capabilities: ['text'],
        complete: async () => {
          throw new Error('上游 500');
        },
      });
      await expect(port.ask({ prompt: 'x' })).rejects.toSatisfy(
        (error: unknown) => isAiError(error) && error.code === 'provider',
      );
    });
  });
}

describe('schema 校验', () => {
  it('缺必填字段报出来', () => {
    expect(problemsOf({}, SCHEMA)).toEqual([{ path: '$.verdict', problem: '缺必填字段' }]);
  });

  it('类型不对报出来', () => {
    expect(problemsOf({ verdict: 1 }, SCHEMA)[0]?.path).toBe('$.verdict');
  });

  it('合 schema 时没有问题', () => {
    expect(problemsOf({ verdict: 'ok' }, SCHEMA)).toEqual([]);
  });

  it('数组 items 逐个校验', () => {
    const schema: JsonSchema = { type: 'array', items: { type: 'string' } };
    expect(problemsOf(['a', 1], schema).length).toBe(1);
  });

  it('strict 时把不认识的关键字当问题', () => {
    const schema: JsonSchema = { type: 'object', 'x-unknown': true };
    expect(problemsOf({}, schema)).toEqual([]);
    expect(problemsOf({}, schema, true).length).toBe(1);
  });
});
