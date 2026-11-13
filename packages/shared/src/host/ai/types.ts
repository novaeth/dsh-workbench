/**
 * 模块用模型的公共词汇：入参、结果、错误码、能力，以及“实现”那一侧的适配器接口。
 *
 * 这层只认模块作者给的东西（字符串、字节、JSON Schema），不暴露 dsh 的内核类型
 * （附件引用、内容块），这样内核换了词汇，模块不受影响。
 *
 * @module dsh-workbench/shared/host/ai/types
 */

/** 这层认的能力；模块先问再降级，不要试错。 */
export type AiCapability = 'text' | 'images' | 'json' | 'tools' | 'agent';

/** 结构化输出用的 JSON Schema（只用到对象根的一小部分关键字）。 */
export type JsonSchema = Readonly<Record<string, unknown>>;

/**
 * 图片的三种给法：data URL、绝对路径、原始字节。
 * 这层负责把它翻成内核的持久附件，模块不需要知道附件引用长什么样。
 */
export type ImageLike =
  | string
  | Uint8Array
  | { readonly data: Uint8Array; readonly mediaType: string; readonly name?: string };

/** 留给将来的非图片附件（PDF、音频）；现在只有占位，实现了才算数。 */
export type AttachmentLike = never;

/** 一次调用要的东西；除 `prompt` 外都可选，所以加字段永远不算破坏性变更。 */
export interface AiRequest {
  readonly prompt: string;
  readonly images?: readonly ImageLike[] | undefined;
  readonly attachments?: readonly AttachmentLike[] | undefined;
  readonly schema?: JsonSchema | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onStep?: ((text: string) => void) | undefined;
  readonly onDelta?: ((chunk: string) => void) | undefined;
  readonly model?: { readonly provider?: string; readonly model?: string } | undefined;
  readonly temperature?: number | undefined;
  readonly retry?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly strict?: boolean | undefined;
}

/** 直接交给 agent 的一个工具：描述加实现，只在这次调用里有效。 */
export interface AiToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  run(args: unknown, context: { readonly signal: AbortSignal }): Promise<unknown>;
}

/** 子 agent 的配置面；只有 `agent` 这个动词认。 */
export interface AgentOptions {
  readonly preset?: string | undefined;
  readonly tools?:
    | {
        readonly allow?: readonly string[] | undefined;
        readonly deny?: readonly string[] | undefined;
        readonly provide?: readonly AiToolDefinition[] | undefined;
        readonly timeoutMsPerTool?: number | undefined;
      }
    | undefined;
  readonly cwd?: string | undefined;
  readonly name?: string | undefined;
  readonly label?: string | undefined;
  readonly session?: 'new' | { readonly resume: string } | undefined;
  readonly approval?: 'never' | 'inherit' | undefined;
  readonly maxTurns?: number | undefined;
  readonly maxToolCalls?: number | undefined;
  readonly budget?: { readonly tokens?: number; readonly ms?: number } | undefined;
  readonly onTool?: ((call: { readonly name: string; readonly args: unknown }) => void | 'deny') | undefined;
  readonly onEvent?: ((event: AiEvent) => void) | undefined;
  readonly context?: { readonly includeParent?: boolean; readonly files?: readonly string[] } | undefined;
  readonly delivery?: 'caller' | 'async' | undefined;
}

/** 子 agent 跑的过程；未知种类一律忽略，将来加新事件不算破坏。 */
export type AiEvent =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tool-call'; readonly name: string; readonly args: unknown }
  | { readonly kind: 'tool-result'; readonly name: string; readonly ok: boolean }
  | { readonly kind: 'step'; readonly index: number }
  | { readonly kind: 'approval-denied'; readonly name: string; readonly reason: string };

/** 一次调用的结果；`ask` 只取 `text`，要细节的走 `askRich`。 */
export interface AiResult {
  readonly text: string;
  readonly value?: unknown;
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number } | undefined;
  readonly model?: { readonly provider: string; readonly model: string } | undefined;
  readonly elapsedMs?: number | undefined;
  readonly agent?:
    | {
        readonly childId: string;
        readonly stopReason: string;
        readonly turns: number;
        readonly toolCalls: number;
      }
    | undefined;
}

/** 错误码：只增不删；认不出的码按失败处理。 */
export type AiErrorCode =
  | 'no-model'
  | 'unsupported-input'
  | 'unsupported-option'
  | 'schema-mismatch'
  | 'aborted'
  | 'timeout'
  | 'provider'
  | 'budget-exceeded'
  | (string & {});

/** 这层抛的唯一一种错误。 */
export interface AiError extends Error {
  readonly code: AiErrorCode;
  readonly details?: Record<string, unknown> | undefined;
}

export function aiError(code: AiErrorCode, message: string, details?: Record<string, unknown>): AiError {
  const error = new Error(message) as Error & { code: AiErrorCode; details?: Record<string, unknown> };
  error.name = 'AiError';
  error.code = code;
  if (details !== undefined) error.details = details;
  return error as AiError;
}

export function isAiError(value: unknown): value is AiError {
  return (
    value instanceof Error &&
    typeof (value as { code?: unknown }).code === 'string' &&
    (value as { name?: unknown }).name === 'AiError'
  );
}
