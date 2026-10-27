import { randomUUID } from 'node:crypto';
import { encodeRef, parseMarkers, type ContextRef } from '@dsh-workbench/shared/host';
import type { ContextRenderer } from '@dsh-workbench/shared/host';

export const CONTEXT_SOURCE_KIND = 'workbench';

export interface ScannableMessage {
  readonly source?: { readonly kind?: string };
  readonly content?: readonly { readonly type?: string; readonly text?: string }[];
}

export type { ContextRenderer };

export function collectContextRefs(messages: readonly ScannableMessage[]): ContextRef[] {
  const seen = new Set<string>();
  const refs: ContextRef[] = [];
  for (const message of messages) {
    if (message.source?.kind !== 'user') continue;
    for (const block of message.content ?? []) {
      if (block.type !== 'text' || typeof block.text !== 'string') continue;
      for (const ref of parseMarkers(block.text)) {
        const key = encodeRef(ref);
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push(ref);
      }
    }
  }
  return refs;
}

export function buildContextMessage(text: string, summary: string): unknown {
  return {
    role: 'user',
    id: randomUUID(),
    content: [{ type: 'text', text }],
    source: { kind: CONTEXT_SOURCE_KIND, form: 'notice', summary },
  };
}

export interface ContextInjector {
  inject(messages: readonly ScannableMessage[], agent: unknown): Promise<unknown | undefined>;
}

export function createContextInjector(options: {
  renderers: ReadonlyMap<string, ContextRenderer>;
  logger?: { warn?(message: string): void } | undefined;
}): ContextInjector {
  const done = new WeakMap<object, Set<string>>();

  return {
    async inject(messages, agent) {
      const refs = collectContextRefs(messages);
      if (refs.length === 0) return undefined;

      const key = typeof agent === 'object' && agent !== null ? (agent as object) : undefined;
      const seen = key === undefined ? undefined : (done.get(key) ?? new Set<string>());
      if (key !== undefined && seen !== undefined) done.set(key, seen);

      const fresh: ContextRef[] = [];
      for (const ref of refs) {
        const encoded = encodeRef(ref);
        if (seen?.has(encoded) === true) continue;
        seen?.add(encoded);
        fresh.push(ref);
      }
      if (fresh.length === 0) return undefined;

      const texts: string[] = [];
      for (const ref of fresh) {
        const render = options.renderers.get(ref.kind);
        if (render === undefined) continue;
        let text: string;
        try {
          text = await render(ref);
        } catch (error) {
          options.logger?.warn?.(`[dsh-workbench] 渲染对话引用失败：${String(error)}`);
          text = `工作台面板引用了一条内容（${encodeRef(ref)}），但当前渲染不出来（项目未选中或数据源不可用）。`;
        }
        if (text !== '') texts.push(text);
      }
      if (texts.length === 0) return undefined;

      return buildContextMessage(texts.join('\n\n'), `工作台引用：${fresh.length} 条`);
    },
  };
}
