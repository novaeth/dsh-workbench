import type {
  DshClientContext,
  DshConversationService,
  DshInputTriggers,
  DshReferenceInsert,
  DshSessionsService,
} from '@dsh-workbench/shared';
import { buildMarker, encodeRef, markerBody, type ContextRef } from '@dsh-workbench/shared';

/**
 * 对话 `@` 引用源报名用的名字：引用、lexicon 与编解码都挂在这个 source 名下。
 */
export const CONTEXT_SOURCE = 'workbench';

/**
 * `addContextChip` 的结果：`inserted` 真插进输入框了、`unavailable` 这台 dsh 缺服务或当时插不进去。
 */
export type ChipResult = 'inserted' | 'unavailable';

/**
 * 装引用源要的外壳依赖：现在这个会话是哪一个 —— 拿不到 session id 就插不了。
 */
export interface ContextChipsDeps {
  currentSessionId(): string | undefined;
}

let runtime: { ctx: DshClientContext; deps: ContextChipsDeps } | null = null;

const inserted = new Set<string>();
const lexiconListeners = new Set<() => void>();

const INSERT_RETRY_MAX = 5;
const INSERT_RETRY_DELAY_MS = 80;

/**
 * 外壳启动、拿到 dsh 的 client context 之后调一次：把 `@` 引用源注册进对话输入框；
 * dsh 没给 `inputTriggers` 时不装、也不报错。
 */
export function installContextChips(ctx: DshClientContext, deps: ContextChipsDeps): void {
  runtime = { ctx, deps };

  const triggers = ctx.get<DshInputTriggers>('inputTriggers');
  if (triggers === undefined) return;

  ctx.effect(
    () =>
      triggers.registerSource({
        trigger: '@',
        name: CONTEXT_SOURCE,
        candidates: async () => [],
        onPick: () => undefined,
        lexicon: () => [...inserted],
        subscribeLexicon: (_session: unknown, listener: () => void) => {
          lexiconListeners.add(listener);
          return () => lexiconListeners.delete(listener);
        },
        codec: {
          clipboardText: (ref: string) => serializeChipRef(ref),
          serialize: async (ref: string) => serializeChipRef(ref),
        },
      }),
    'dsh-workbench: 对话引用源',
  );
}

/**
 * 要往当前对话输入框插一条 `@` 引用时调用（卡片上“发到对话”那类动作）：同步返回，只反映当场这一拍 ——
 * 没插进去会自己再试几拍，后面成功了也不会回头改这个返回值。没装过 / 没会话 / 拿不到输入框都回 `unavailable`。
 */
export function addContextChip(ref: ContextRef, label: string): ChipResult {
  const here = runtime;
  if (here === null) return 'unavailable';

  const sessionId = here.deps.currentSessionId();
  if (sessionId === undefined) return 'unavailable';

  const sessions = here.ctx.get<DshSessionsService>('sessions');
  const conversation = here.ctx.get<DshConversationService>('conversation');
  if (sessions === undefined || conversation === undefined) return 'unavailable';

  const actx = sessions.scope(sessionId);
  if (actx === undefined) return 'unavailable';

  let input;
  try {
    input = conversation.input.for(actx);
  } catch {
    return 'unavailable';
  }
  if (input === undefined) return 'unavailable';

  const reference: DshReferenceInsert = {
    source: CONTEXT_SOURCE,
    ref: encodeRef(ref),
    label,
    appearance: 'file',
    clipboardText: `@${label}`,
  };

  let settled: ChipResult = 'unavailable';
  const attempt = (left: number): void => {
    try {
      const snapshot = input.state.getSnapshot();
      const caret = input.caretSpan?.();
      if (snapshot !== undefined && caret !== undefined) {
        const ok = input.insertReference(reference, {
          start: caret.start,
          end: caret.end,
          draftRev: snapshot.draftRev,
        });
        if (ok) {
          settled = 'inserted';
          inserted.add(markerBody(encodeRef(ref)));
          for (const listener of lexiconListeners) listener();
          return;
        }
      }
    } catch {
    }
    if (left > 0) {
      setTimeout(() => attempt(left - 1), INSERT_RETRY_DELAY_MS);
    }
  };
  attempt(INSERT_RETRY_MAX);

  return settled;
}

/**
 * 把编好的引用串码成带 `@` 的标记文本（输入框里显示与复制到剪贴板都是这一份）；认不出的串原样加个 `@`。
 */
export function serializeChipRef(encoded: string): string {
  const at = encoded.indexOf(':');
  const kind = at > 0 ? encoded.slice(0, at) : '';
  const parts = at > 0 ? encoded.slice(at + 1).split('/').filter(Boolean) : [];
  if (kind === '' || parts.length === 0) return `@${encoded}`;
  return buildMarker({ kind, parts });
}
