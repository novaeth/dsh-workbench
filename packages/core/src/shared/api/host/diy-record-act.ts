import type { PostResource, RecordIntent, RecordState, RecordStore } from '@dsh-workbench/shared/host';
import { parseRecordIntent } from '@dsh-workbench/shared/host';
import { deliverDebugNotice, noticeMessage, type AgentsLookup, type NoticeMessage } from './diy-debug-act';

export const RECORD_NOTICE_KIND = 'workbench-diy-record';

const INTENT_WORD: Readonly<Record<RecordIntent, string>> = {
  peek: '看结果',
  halt: '停',
  stop: '收工',
};

export function recordNoticeText(intent: RecordIntent, state: RecordState): string {
  const head = `［工作台 DIY］用户按了「${INTENT_WORD[intent]}」：`;
  if (intent === 'peek') {
    return state.phase === 'finished'
      ? `${head}${state.unit} 用户已结束这一段录制 —— 用 workbench_diy_record_read 取那一段（用户不在了也照取），取过用 workbench_diy_record_stop 收工。`
      : `${head}${state.unit} 这一段现在还是 ${state.phase}（用户还没按「结束录制」）—— 等用户按完再 read；用户要是说浮条没了，read 那一步会顺手把浮条重新装上。`;
  }
  if (intent === 'halt') {
    return (
      `${head}${state.unit} 用户停下了这一段（浮条可能被导航干掉过）。` +
      '**先 read 再 stop**：read 会把那一页上的缓冲取出来，stop 之后就取不到了 —— 顺序反了就等于白录。'
    );
  }
  return `${head}${state.unit} 这一场收了（占用解除）。已经 read 过的部分在你手上；没读的那部分没了 —— 要再录一段重新 prepare 一场。`;
}

export function recordNoticeSummary(intent: RecordIntent, state: RecordState): string {
  return `工作台 DIY：用户按了${INTENT_WORD[intent]}（${state.unit}）`;
}

export function recordNotice(intent: RecordIntent, state: RecordState): { message: NoticeMessage; summary: string } {
  const summary = recordNoticeSummary(intent, state);
  return { summary, message: noticeMessage(recordNoticeText(intent, state), summary, RECORD_NOTICE_KIND) };
}

const NOTICE_MODE: Readonly<Record<RecordIntent, 'wake' | 'hold' | 'drop'>> = {
  peek: 'wake',
  halt: 'wake',
  stop: 'drop',
};

const REFUSAL = '现在没有录制中的那一场 —— 没什么可停 / 可收的';

export interface RecordActDeps {
  readonly store: () => RecordStore | undefined;
  readonly agents: () => AgentsLookup | undefined;
  readonly now?: (() => number) | undefined;
  readonly notice?:
    | ((intent: RecordIntent, state: RecordState) => { message: NoticeMessage; summary: string })
    | undefined;
}

async function releaseHeld(
  store: RecordStore,
  held: RecordState,
): Promise<{ readonly tab: boolean; readonly capture: boolean }> {
  try {
    return await (store.release?.(held) ?? Promise.resolve({ tab: false, capture: false }));
  } catch {
    return { tab: false, capture: false };
  }
}

export function recordActResource(deps: RecordActDeps): PostResource {
  const now = (): number => deps.now?.() ?? Date.now();
  return {
    resource: 'act',
    async handle(payload) {
      const intent = parseRecordIntent((payload as { intent?: unknown } | null)?.intent);
      if (intent === null) return { ok: false, text: '不认识的意图（只认 peek / halt / stop）' };

      const store = deps.store();
      const at = now();
      const held = store?.live(at) ?? null;
      if (store === undefined || held === null) return { ok: false, text: REFUSAL };

      const notice = deps.notice?.(intent, held) ?? recordNotice(intent, held);
      if (intent !== 'stop') {
        const delivered = deliverDebugNotice(deps.agents(), held.sessionId, notice.message, NOTICE_MODE[intent]);
        return { ok: true, intent, delivered, summary: notice.summary, state: store.live(now()) };
      }

      const cleaned = await releaseHeld(store, held);
      const move = store.stop(held.sessionId, at);
      const delivered = deliverDebugNotice(deps.agents(), held.sessionId, notice.message, NOTICE_MODE[intent]);
      return {
        ok: true,
        intent,
        delivered,
        summary: notice.summary,
        cleaned,
        refused: move.ok ? '' : move.code,
        state: store.live(now()),
      };
    },
  };
}
