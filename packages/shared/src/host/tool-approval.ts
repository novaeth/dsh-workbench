export { APPROVAL_NOTE_ARG } from '../contract/approval.js';

import { APPROVAL_NOTE_ARG } from '../contract/approval.js';

export type AskDecision =
  | {
      readonly kind: 'ask';
      readonly reason: string;
      readonly displayReason: { readonly en: string; readonly zh: string };
    }
  | {
      readonly kind: 'deny';
      readonly reason: string;
    };

export interface ApprovalDetail {
  readonly en: string;
  readonly zh: string;
}

export type ApprovalFacts = ApprovalDetail | { readonly blocked: string };

export const APPROVAL_NOTE_LIMIT = 40;

export const APPROVAL_DETAIL_LIMIT = 20;

export const APPROVAL_QUESTION_LIMIT = 40;

export const APPROVAL_SEPARATOR_LIMIT = 8;

export const APPROVAL_HEADLINE_LIMIT =
  APPROVAL_DETAIL_LIMIT + APPROVAL_QUESTION_LIMIT + APPROVAL_NOTE_LIMIT + APPROVAL_SEPARATOR_LIMIT;

const NOTE_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'string',
  description: '一句话说明你这次想拿它干什么（要点头时显示在审批屏上；40 字以内）。',
};

export function withApprovalNote(
  parameters: Record<string, unknown>,
  options: { readonly required?: boolean | undefined } = {},
): Record<string, unknown> {
  const properties = parameters['properties'];
  if (typeof properties !== 'object' || properties === null) return parameters;
  const map = properties as Record<string, unknown>;
  if (APPROVAL_NOTE_ARG in map) return parameters;

  const declared = Array.isArray(parameters['required']) ? parameters['required'] : [];
  const kept = declared.filter((name) => name !== APPROVAL_NOTE_ARG);
  const required = options.required === true ? [...kept, APPROVAL_NOTE_ARG] : kept;

  return {
    ...parameters,
    properties: { ...map, [APPROVAL_NOTE_ARG]: NOTE_SCHEMA },
    ...(required.length === 0 ? {} : { required }),
  };
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function approvalNoteOf(call: ApprovalCall): string | undefined {
  const raw = call.arguments;
  const value =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[APPROVAL_NOTE_ARG] : undefined;
  if (typeof value !== 'string') return undefined;
  const line = oneLine(value);
  if (line === '') return undefined;
  return line.length > APPROVAL_NOTE_LIMIT ? `${line.slice(0, APPROVAL_NOTE_LIMIT)}…` : line;
}

export interface ApprovalCall {
  readonly name?: string | undefined;
  readonly arguments?: unknown;
  readonly workspace?: string | undefined;
  readonly session?: string | undefined;
}

/**
 * 套件对一次写调用给出的判定：`read` 只是看看、`allow` 会写但本套件不问、`deny` 这一次根本跑不成
 * （连问都不该问，`reason` 原样交给 agent）、`ask` 要用户点头（`question` 接在明细后，`fallback` 是没明细时的整句；
 * `noteInDetail` 为真表示套件把 agent 的附注画在自己的详情座里，标题只留动作、不再追加）。
 */
export type ApprovalVerdict =
  | { readonly kind: 'read' }
  | { readonly kind: 'allow' }
  | {
      readonly kind: 'deny';
      readonly reason: string;
    }
  | {
      readonly kind: 'ask';
      readonly reason: string;
      readonly question: ApprovalDetail;
      readonly fallback: ApprovalDetail;
      readonly noteInDetail?: boolean;
    };

export type ApprovalPolicy = (call: ApprovalCall) => ApprovalVerdict | undefined;

/**
 * 闸门的输入：`skipAsk` 为真表示会话已经不要审批提示（完全权限）—— 认领检查、`{blocked}` 与套件自己的
 * `deny` 照旧，只是不再返回 `ask`；dsh 在 `approval: never` 下会把 `ask` 直接拒掉。
 */
export interface ApprovalContext {
  readonly writes?: boolean | undefined;
  readonly policy?: ApprovalPolicy | undefined;
  readonly declaredNote?: boolean | undefined;
  readonly skipAsk?: boolean | undefined;
  readonly detailOf?:
    | ((call: ApprovalCall) => ApprovalFacts | undefined | Promise<ApprovalFacts | undefined>)
    | undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compose(
  detail: ApprovalDetail | undefined,
  verdict: { readonly question: ApprovalDetail; readonly fallback: ApprovalDetail },
  note: string | undefined,
): ApprovalDetail {
  const base =
    detail === undefined || typeof detail.zh !== 'string' || detail.zh.trim() === ''
      ? verdict.fallback
      : {
          en: `${detail.en} — ${verdict.question.en}`,
          zh: `${detail.zh} —— ${verdict.question.zh}`,
        };
  const line = note === undefined ? base : { en: `${base.en} — ${note}`, zh: `${base.zh} —— ${note}` };
  return { en: oneLine(line.en), zh: oneLine(line.zh) };
}

export async function approvalFor(
  call: ApprovalCall,
  context: ApprovalContext = {},
): Promise<AskDecision | undefined> {
  if (context.writes !== true) return undefined;

  let verdict: ApprovalVerdict | undefined;
  try {
    verdict = context.policy?.(call);
  } catch (error) {
    return {
      kind: 'deny',
      reason: `问"要不要审批"的时候套件的策略抛了错，已经停下：${messageOf(error)}`,
    };
  }

  if (verdict?.kind === 'read' || verdict?.kind === 'allow') return undefined;

  if (verdict?.kind === 'deny') return { kind: 'deny', reason: verdict.reason };

  if (verdict?.kind !== 'ask') {
    return {
      kind: 'deny',
      reason:
        `${call.name ?? '这把工具'} 在清单里声明会写东西，但它的套件没认领这次调用 —— 停下：` +
        '在套件的 needsApproval 里补一条审批（含"这次会发生什么"），别让写静默过去',
    };
  }

  let facts: ApprovalFacts | undefined;
  try {
    facts = await context.detailOf?.(call);
  } catch (error) {
    return { kind: 'deny', reason: `拿不到"这次会发生什么"，已经停下：${messageOf(error)}` };
  }
  if (facts !== undefined && 'blocked' in facts) return { kind: 'deny', reason: facts.blocked };

  if (context.skipAsk === true) return undefined;

  const note =
    context.declaredNote === true && verdict.noteInDetail !== true ? approvalNoteOf(call) : undefined;

  return {
    kind: 'ask',
    reason: verdict.reason,
    displayReason: compose(facts, verdict, note),
  };
}

/**
 * 「写工具要点头」那一对的默认口径：点名的工具一律 `ask` + 同一份明细，其余一律 `read`。
 * 把它直接摊在 `mount()` 的返回值里：`...writeApprovalOf({ … })`。
 * @param options.tools 需要点头的工具名。
 * @param options.reason 为什么问（给 agent 看的理由）。
 * @param options.question 问句（zh / en，≤40 字）。
 * @param options.fallback 没有明细时的整句（zh / en，≤40 字）。
 * @param options.detail 审批屏头行那句明细（zh / en，≤20 字）。
 * @returns `{ needsApproval, approvalDetail }`。
 */
export function writeApprovalOf(options: {
  readonly tools: readonly string[];
  readonly reason: string;
  readonly question: ApprovalDetail;
  readonly fallback: ApprovalDetail;
  readonly detail: ApprovalDetail;
}): {
  needsApproval(call: ApprovalCall): ApprovalVerdict;
  approvalDetail(call: ApprovalCall): ApprovalFacts | undefined;
} {
  const tools = new Set(options.tools);
  const named = (call: ApprovalCall): boolean => call.name !== undefined && tools.has(call.name);
  return {
    needsApproval: (call) =>
      named(call)
        ? { kind: 'ask', reason: options.reason, question: options.question, fallback: options.fallback }
        : { kind: 'read' },
    approvalDetail: (call) => (named(call) ? options.detail : undefined),
  };
}
