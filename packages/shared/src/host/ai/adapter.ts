import type { AgentOptions, AiCapability, AiResult, JsonSchema } from './types.js';

/** 一次调用里的一截内容：文字或一张图（图已经翻成字节）。 */
export type AiPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly data: Uint8Array; readonly mediaType: string; readonly name?: string };

/** 完成一次调用的请求。 */
export interface AiCompleteRequest {
  readonly parts: readonly AiPart[];
  readonly schema?: JsonSchema | undefined;
  readonly model?: { readonly provider?: string; readonly model?: string } | undefined;
  readonly temperature?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onDelta?: ((chunk: string) => void) | undefined;
}

/** 完成一次调用的结果。 */
export interface AiCompleteResult {
  readonly text: string;
  readonly usage?: AiResult['usage'];
  readonly model?: AiResult['model'];
}

/** 起一轮子 agent 的请求；`tools.provide` 的桥接由适配器实现（只有它碰得到工具面）。 */
export interface AiAgentRequest {
  readonly parts: readonly AiPart[];
  readonly agent: AgentOptions;
  readonly schema?: JsonSchema | undefined;
  readonly model?: { readonly provider?: string; readonly model?: string } | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** 一轮子 agent 的结果。 */
export interface AiAgentResult {
  readonly text: string;
  readonly value?: unknown;
  readonly childId: string;
  readonly stopReason: string;
  readonly turns?: number | undefined;
  readonly toolCalls?: number | undefined;
  readonly usage?: AiResult['usage'];
  readonly model?: AiResult['model'];
}

/** 适配器：模块不实现它，工作台与测试替身实现它。 */
export interface AiAdapter {
  readonly name: string;
  readonly capabilities: readonly AiCapability[];
  complete(request: AiCompleteRequest): Promise<AiCompleteResult>;
  runAgent?(request: AiAgentRequest): Promise<AiAgentResult>;
}
