/**
 * 把 dsh 的模型端口、附件服务与子 agent 通道，包成模块用的 `AiAdapter`。
 *
 * 只有这里碰 dsh 的词汇（内容块、附件引用）；模块看到的是 `AiRequest`。
 *
 * @module @dsh-workbench/core/shared/api/host/ai-adapter
 */
import type {
  AiAdapter,
  AiAgentRequest,
  AiAgentResult,
  AiCapability,
  AiCompleteRequest,
  AiCompleteResult,
  AiPart,
  DshHostContext,
  FlowAgentPort,
} from '@dsh-workbench/shared/host';
import { aiError, createAiPort, type AgentOptions, type AiPort } from '@dsh-workbench/shared/host';
import { registerBridgeTool } from './ai-tools';

interface ToolRegistryLike {
  register(definition: Readonly<Record<string, unknown>>): () => void;
}

interface StreamChunk {
  readonly type?: unknown;
  readonly text?: unknown;
  readonly reason?: { readonly kind?: unknown };
}

interface LlmLike {
  stream(options: Readonly<Record<string, unknown>>): AsyncIterable<unknown>;
}

interface ModelDefaults {
  currentSelection(): { readonly provider?: unknown; readonly model?: unknown } | undefined;
}

interface AttachmentStore {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<unknown>;
}

function selectionOf(
  ctx: DshHostContext,
  override: { readonly provider?: string; readonly model?: string } | undefined,
): { readonly provider: string; readonly model: string } | undefined {
  const defaults = ctx.get('agentDefaultModel') as unknown as ModelDefaults | undefined;
  const current =
    defaults !== undefined && typeof defaults.currentSelection === 'function'
      ? (() => {
          try {
            return defaults.currentSelection();
          } catch {
            return undefined;
          }
        })()
      : undefined;
  const provider = override?.provider ?? (typeof current?.provider === 'string' ? current.provider : '');
  const model = override?.model ?? (typeof current?.model === 'string' ? current.model : '');
  if (provider === '' || model === '') return undefined;
  return { provider, model };
}

async function blocksOf(parts: readonly AiPart[], store: AttachmentStore | undefined): Promise<unknown[]> {
  const blocks: unknown[] = [];
  for (const part of parts) {
    if (part.kind === 'text') {
      blocks.push({ type: 'text', text: part.text });
      continue;
    }
    if (store === undefined) {
      throw aiError('unsupported-input', '这一份运行时没有附件服务，图片送不进模型');
    }
    const ref = await store.saveImage({
      data: part.data,
      mediaType: part.mediaType,
      ...(part.name === undefined ? {} : { name: part.name }),
    });
    blocks.push({ type: 'image', attachment: ref });
  }
  return blocks;
}

/**
 * 建一份适配器。
 * @param ctx 宿主上下文。
 * @param agent 子 agent 端口；没有就没有 `agent` 能力。
 * @returns 适配器。
 */
export function createDshAiAdapter(ctx: DshHostContext, agentOf: () => FlowAgentPort | undefined): AiAdapter {
  const llm = ctx.get('llm') as unknown as LlmLike | undefined;
  const store = ctx.get('attachments') as unknown as AttachmentStore | undefined;
  const capabilities: AiCapability[] = ['text', 'json'];
  if (store !== undefined) capabilities.push('images');
  if (ctx.get('subagents') !== undefined && ctx.get('agents') !== undefined) capabilities.push('agent');

  return {
    name: 'dsh',
    capabilities,
    async complete(request: AiCompleteRequest): Promise<AiCompleteResult> {
      if (llm === undefined || typeof llm.stream !== 'function') {
        throw aiError('no-model', '这一份运行时没有可用的模型端口');
      }
      const chosen = selectionOf(ctx, request.model);
      if (chosen === undefined) throw aiError('no-model', '没有选中模型：界面上先选一个');
      const content = await blocksOf(request.parts, store);
      let text = '';
      const stream = llm.stream({
        provider: chosen.provider,
        model: chosen.model,
        temperature: request.temperature ?? 0,
        messages: [{ role: 'user', content }],
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      for await (const raw of stream) {
        const chunk = raw as StreamChunk;
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          text += chunk.text;
          request.onDelta?.(chunk.text);
        }
        if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
          throw aiError('provider', '模型这次没给完结论就结束了');
        }
      }
      return { text, model: chosen };
    },
    async runAgent(request: AiAgentRequest): Promise<AiAgentResult> {
      const agent = agentOf();
      if (agent === undefined) throw aiError('unsupported-option', '这一份运行时不支持 agent');
      refuseUnsupported(request.agent);
      const provide = request.agent.tools?.provide ?? [];
      const registry = ctx.get('tools') as unknown as ToolRegistryLike | undefined;
      if (provide.length > 0 && registry === undefined) {
        throw aiError('unsupported-option', '这一份运行时没有工具注册表，tools.provide 用不了');
      }
      const bridge =
        provide.length === 0 || registry === undefined
          ? undefined
          : registerBridgeTool(registry, provide, request.agent.tools?.timeoutMsPerTool ?? 0, request.signal);
      const budgetMs = request.agent.budget?.ms ?? 0;
      const budgeted = budgetMs > 0 ? new AbortController() : undefined;
      const budgetTimer =
        budgeted === undefined
          ? undefined
          : setTimeout(() => { budgeted.abort(); }, budgetMs);
      const outward = request.signal ?? new AbortController().signal;
      const effective = budgeted === undefined ? outward : AbortSignal.any([outward, budgeted.signal]);
      const toolFilter = {
        ...(request.agent.tools?.allow === undefined
          ? bridge === undefined ? {} : { allow: [bridge.name] }
          : { allow: bridge === undefined ? [...request.agent.tools.allow] : [...request.agent.tools.allow, bridge.name] }),
        ...(request.agent.tools?.deny === undefined ? {} : { deny: [...request.agent.tools.deny] }),
      };
      const withImage = request.parts.some((one) => one.kind === 'image');
      if (withImage) {
        throw aiError('unsupported-input', 'agent 调用暂时还不能带图片：先用 ask 让模型看图，再把结论给 agent');
      }
      const prompt = request.parts
        .map((one) => (one.kind === 'text' ? one.text : ''))
        .join('\n')
        .trim();
      try {
        const runner = await agent.open({
          workspace: request.agent.cwd ?? process.cwd(),
          sessionId: undefined,
          signal: effective,
        });
        try {
          request.agent.onEvent?.({ kind: 'step', index: 0 });
          const done = await runner.run(
          {
            stepId: 'ai',
            prompt,
            ...(Object.keys(toolFilter).length === 0 ? {} : { toolFilter }),
            ...(request.agent.label === undefined ? {} : { label: request.agent.label }),
            ...(request.agent.name === undefined ? {} : { name: request.agent.name }),
            ...(request.agent.preset === undefined ? {} : { preset: request.agent.preset }),
            ...(request.agent.cwd === undefined ? {} : { cwd: request.agent.cwd }),
            ...(request.model?.provider === undefined ? {} : { provider: request.model.provider }),
            ...(request.model?.model === undefined ? {} : { model: request.model.model }),
            ...(request.schema === undefined ? {} : { schema: request.schema }),
          },
          effective,
        );
          request.agent.onEvent?.({ kind: 'text', text: done.text });
          return {
            text: done.text,
            ...(done.value === undefined ? {} : { value: done.value }),
            childId: done.childId,
            stopReason: done.stopReason,
            turns: 0,
            toolCalls: 0,
          };
        } finally {
          await runner.dispose();
        }
      } catch (error) {
        if (budgeted?.signal.aborted === true) {
          throw aiError('budget-exceeded', `这一轮 agent 超出预算（${String(budgetMs)}ms）`);
        }
        throw error;
      } finally {
        if (budgetTimer !== undefined) clearTimeout(budgetTimer);
        bridge?.dispose();
      }
    },
  };
}

const REFUSED_KEYS: readonly (keyof AgentOptions)[] = [
  'session',
  'maxTurns',
  'maxToolCalls',
  'onTool',
  'context',
  'delivery',
  'approval',
];

function refuseUnsupported(agent: AgentOptions): void {
  for (const key of REFUSED_KEYS) {
    if (agent[key] !== undefined) {
      throw aiError('unsupported-option', `这一份运行时还不支持 agent.${String(key)}`);
    }
  }
  if (agent.budget?.tokens !== undefined) {
    throw aiError('unsupported-option', '这一份运行时还不支持按 token 计预算，先用 budget.ms');
  }
}

/**
 * 建一份模块用的模型入口；没有模型端口时也照样给（能力里会说没有 text）。
 * @param ctx 宿主上下文。
 * @param agent 子 agent 端口。
 * @returns 端口。
 */
export function createDshAi(ctx: DshHostContext, agentOf: () => FlowAgentPort | undefined): AiPort {
  return createAiPort(createDshAiAdapter(ctx, agentOf));
}
