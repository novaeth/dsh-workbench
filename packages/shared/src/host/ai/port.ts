/**
 * 端口：模块唯一要认识的那层。四个动词 + 能力探测 + 换实现。
 *
 * 它只做“跟模型无关”的事：归一化入参、结构化输出与重试、中止与超时、错误码。
 * 真的调模型（以及起子 agent）交给适配器。
 *
 * @module dsh-workbench/shared/host/ai/port
 */
import type { AiAdapter, AiAgentResult, AiPart } from './adapter.js';
import { partsOf } from './parts.js';
import { problemsOf } from './schema.js';
import {
  aiError,
  type AgentOptions,
  type AiCapability,
  type AiRequest,
  type AiResult,
  type JsonSchema,
} from './types.js';

/** 这层的版本号：只增。 */
export const AI_VERSION = 1;

export interface AiPort {
  readonly version: number;
  ask(request: AiRequest): Promise<string>;
  askJson<T>(request: AiRequest & { readonly schema: JsonSchema }): Promise<T>;
  askRich(request: AiRequest): Promise<AiResult>;
  agent(request: AiRequest & { readonly agent?: AgentOptions }): Promise<string>;
  supports(capability: AiCapability): boolean;
  registerAdapter(adapter: AiAdapter): () => void;
}

function jsonOf(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

function raceSignal(request: AiRequest): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (request.signal !== undefined) signals.push(request.signal);
  if (request.timeoutMs !== undefined && request.timeoutMs > 0) signals.push(AbortSignal.timeout(request.timeoutMs));
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}

function abortedNow(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function abortedOf(request: AiRequest, error: unknown): never {
  const timedOut = request.timeoutMs !== undefined && request.timeoutMs > 0 && request.signal?.aborted !== true;
  const detail = { cause: error instanceof Error ? error.message : String(error) };
  throw timedOut
    ? aiError('timeout', `模型调用超时（${String(request.timeoutMs)}ms）`, detail)
    : aiError('aborted', '模型调用被中止', detail);
}

/**
 * 建一个端口；`initial` 是当前要用的适配器，之后可用 `registerAdapter` 换。
 * @param initial 初始适配器。
 * @returns 端口。
 */
export function createAiPort(initial: AiAdapter): AiPort {
  let adapter = initial;
  const port: AiPort = {
    version: AI_VERSION,
    supports: (capability) => adapter.capabilities.includes(capability),
    registerAdapter(next) {
      const previous = adapter;
      adapter = next;
      return () => {
        adapter = previous;
      };
    },
    async askRich(request) {
      if (!port.supports('text')) throw aiError('no-model', '这一份运行时没有可用的模型');
      if (request.signal?.aborted === true) throw aiError('aborted', '模型调用被中止');
      const parts: AiPart[] = await partsOf(request);
      if (parts.some((one) => one.kind === 'image') && !port.supports('images')) {
        throw aiError('unsupported-input', '当前模型不吃图片，请先 supports("images") 再决定降级');
      }
      const started = Date.now();
      const signal = raceSignal(request);
      try {
        const done = await adapter.complete({
          parts,
          ...(request.schema === undefined ? {} : { schema: request.schema }),
          ...(request.model === undefined ? {} : { model: request.model }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(signal === undefined ? {} : { signal }),
          ...(request.onDelta === undefined ? {} : { onDelta: request.onDelta }),
        });
        return {
          text: done.text,
          ...(done.usage === undefined ? {} : { usage: done.usage }),
          ...(done.model === undefined ? {} : { model: done.model }),
          elapsedMs: Date.now() - started,
        };
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'AbortError' || name === 'TimeoutError') abortedOf(request, error);
        if (error instanceof Error && (error as { code?: string }).code !== undefined) throw error;
        throw aiError('provider', error instanceof Error ? error.message : String(error));
      }
    },
    async ask(request) {
      const result = await port.askRich(request);
      return result.text;
    },
    async askJson<T>(request: AiRequest & { readonly schema: JsonSchema }): Promise<T> {
      const attempts = Math.max(1, Math.floor(request.retry ?? 1) + 1);
      let raw = '';
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        raw = await port.ask(request);
        const value = jsonOf(raw);
        if (value !== undefined) {
          const problems = problemsOf(value, request.schema, request.strict ?? false);
          if (problems.length === 0) return value as T;
        }
        request.onStep?.(`结构化输出不合要求，重试（${String(attempt + 1)}/${String(attempts)}）`);
      }
      throw aiError('schema-mismatch', '模型输出不符合给定的 schema', { raw: raw.slice(0, 2000) });
    },
    async agent(request) {
      if (adapter.runAgent === undefined || !adapter.capabilities.includes('agent')) {
        throw aiError('unsupported-option', '这一份运行时不支持 agent 调用');
      }
      if (request.signal?.aborted === true) throw aiError('aborted', '模型调用被中止');
      const parts = await partsOf(request);
      const signal = raceSignal(request);
      try {
        const done: AiAgentResult = await adapter.runAgent({
          parts,
          agent: request.agent ?? {},
          ...(request.schema === undefined ? {} : { schema: request.schema }),
          ...(request.model === undefined ? {} : { model: request.model }),
          ...(signal === undefined ? {} : { signal }),
        });
        return done.text;
      } catch (error) {
        if (abortedNow(request.signal) || (error instanceof Error && error.name === 'AbortError')) {
          abortedOf(request, error);
        }
        if (error instanceof Error && (error as { code?: string }).code !== undefined) throw error;
        throw aiError('provider', error instanceof Error ? error.message : String(error));
      }
    },
  };
  return port;
}
