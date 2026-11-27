import type { Translate } from '../lib/dsh-client.js';
import type { CapabilityPayload } from '../contract/workbench-contract.js';
import type { ApiError } from './workbench-client.js';
import type { BlockerAction, ModuleBlocker } from '../contract/blocker.js';
import { DIAG_FALLBACK_CODE, diagSpecOf, isDiagCode } from '../contract/blocker.js';
import { faultPromptOf, firstLineOf, type PromptFacts } from '../lib/fault-prompt.js';
import { shortenPath } from '../lib/ui.js';

function retryAction(t: Translate): BlockerAction {
  return { kind: 'retry', label: t('blocker.retry') };
}

function copyAction(t: Translate, text: string): BlockerAction {
  return { kind: 'copy', label: t('blocker.copy'), text };
}

export interface BlockerAsk {
  readonly screen?: string;
  readonly step?: string;
}

export function askAgentActionOf(t: Translate, facts: PromptFacts): BlockerAction {
  return { kind: 'ask-agent', label: t('askAgent.copy'), prompt: faultPromptOf(facts, t) };
}

function askOf(t: Translate, ask: BlockerAsk | undefined): PromptFacts & { screen: string } {
  return {
    screen: ask?.screen ?? t('askAgent.screen.board'),
    ...(ask?.step === undefined ? {} : { step: ask.step }),
  };
}

function cardBlocker(parts: {
  readonly id: string;
  readonly severity: 'block' | 'notice';
  readonly title: string;
  readonly hint: string;
  readonly detail: string | undefined;
  readonly actions: readonly BlockerAction[];
}): ModuleBlocker {
  const base: ModuleBlocker = {
    id: parts.id,
    severity: parts.severity,
    title: parts.title,
    hint: parts.hint,
    actions: parts.actions,
  };
  return parts.detail === undefined ? base : { ...base, detail: parts.detail };
}

/**
 * 把一条诊断码翻成卡住态：标题取该码自己的文案，不认识的码退回兜底那条。
 * @param code 诊断码（`DIAG_*`）；不在注册表里就按兜底码处理。
 * @param t 文案函数，只取 diag.code.* 与 blocker.* 命名空间的键。
 * @param detail 可选的技术细节，原样透传；给 null 就不带。
 * @returns 一定有一张卡，actions 至少一颗「重试」。
 */
export function blockerOfDiag(
  code: string,
  t: Translate,
  detail: string | null = null,
  ask?: BlockerAsk,
): ModuleBlocker {
  const known = isDiagCode(code);
  const spec = diagSpecOf(known ? code : DIAG_FALLBACK_CODE);
  const title = t(spec?.messageKey ?? 'diag.code.unknownCode');
  const actions: readonly BlockerAction[] = known
    ? [retryAction(t)]
    : [
        askAgentActionOf(t, {
          ...askOf(t, ask),
          problem: { why: title, issue: code, ...(detail === null ? {} : { reason: firstLineOf(detail) }) },
        }),
        retryAction(t),
      ];
  return {
    id: `diag:${spec?.code ?? DIAG_FALLBACK_CODE}`,
    severity: 'block',
    title,
    ...(spec?.hintKey === undefined ? {} : { hint: t(spec.hintKey) }),
    ...(detail === null ? {} : { detail }),
    actions,
  };
}

/**
 * 把一次读失败翻成一张卡住态，交给卡片直接渲染。
 * @param error 读口回的错误；undefined 表示连错误都没拿到（多半是网络断，回「原因未知」）。
 * @param t 文案函数，只取 blocker.* 命名空间的键。
 * @param context 判定现场；platform 缺省时标题不带平台名。
 * @returns 一定有一张卡，actions 至少一颗「重试」。
 */
export function blockerOfError(
  error: ApiError | undefined,
  t: Translate,
  context: {
    path?: string | null;
    platform?: string;
    diagnose?: Readonly<Partial<Record<'exec' | 'login' | 'bridge', string>>>;
    ask?: BlockerAsk;
  } = {},
): ModuleBlocker {
  if (error === undefined) {
    const title = t('blocker.unknown.title');
    return {
      id: 'unknown',
      severity: 'block',
      title,
      actions: [askAgentActionOf(t, { ...askOf(t, context.ask), problem: { why: title } }), retryAction(t)],
    };
  }

  switch (error.code) {
    case 'auth-required':
    case 'auth': {
      const path = shortenPath(context.path ?? '');
      void path;
      const actions: BlockerAction[] =
        error.helpUrl === undefined
          ? [retryAction(t)]
          : [
              { kind: 'open-url', label: t('blocker.login.go'), url: error.helpUrl, inline: true },
              retryAction(t),
            ];
      return {
        id: 'auth-required',
        severity: 'block',
        title:
          context.platform === undefined
            ? t('blocker.login.titleGeneric')
            : t('blocker.login.title', { platform: context.platform }),
        hint: error.helpUrl === undefined ? t('blocker.login.manual') : t('blocker.login.hint'),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        actions,
      };
    }

    case 'permission-denied': {
      const actions: BlockerAction[] =
        error.helpUrl === undefined
          ? [retryAction(t)]
          : [
              { kind: 'open-url', label: t('blocker.forbidden.open'), url: error.helpUrl },
              { kind: 'retry', label: t('blocker.retry') },
            ];
      return {
        id: 'permission-denied',
        severity: 'block',
        title:
          context.platform === undefined
            ? t('blocker.forbidden.titleGeneric')
            : t('blocker.forbidden.title', { platform: context.platform }),
        hint: t('blocker.forbidden.hint'),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        actions,
      };
    }

    case 'cli-timeout':
      return {
        id: 'cli-timeout',
        severity: 'notice',
        title: error.message,
        hint: error.hint ?? t('blocker.timeout.hint'),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        actions: [retryAction(t)],
      };

    case 'cli-exec-failed':
      return {
        id: 'cli-exec-failed',
        severity: 'block',
        title: error.message,
        hint: error.hint ?? context.diagnose?.exec ?? t('blocker.exec.hint'),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        actions: [retryAction(t)],
      };

    case 'project-unsupported':
      return {
        id: error.code,
        severity: 'block',
        title: error.message,
        ...(error.hint === undefined ? {} : { hint: error.hint }),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        actions: [retryAction(t)],
      };

    default: {
      const title = t('blocker.unknown.title');
      return {
        id: error.code,
        severity: 'block',
        title,
        ...(error.hint === undefined ? {} : { hint: error.hint }),
        detail: error.detail ?? error.message,
        actions: [
          askAgentActionOf(t, {
            ...askOf(t, context.ask),
            problem: {
              why: title,
              issue: error.code,
              ...(firstLineOf(error.detail ?? error.message) === undefined
                ? {}
                : { reason: firstLineOf(error.detail ?? error.message) }),
              ...(error.diag?.corrId === undefined ? {} : { corrId: error.diag.corrId }),
            },
          }),
          retryAction(t),
        ],
      };
    }
  }
}

/**
 * 把一次读失败与一份能力读数合成一张卡住态：能力闸优先，其次读口错误；两者都干净时返回 `undefined`。
 * @param parts.error - 读口回的错误；`auth-required` 会带上去登录那一颗动作。
 * @param parts.capability - 宿主回的单元环境读数；`ok` 时忽略。
 * @param parts.t - 文案函数，只取 `blocker.*` 命名空间的键。
 * @param parts.platform - 平台名；给了就用「需要登录 {平台}」那一句。
 * @param parts.loginUrl - 登录地址；`error.helpUrl` 没给时用它补上。
 * @returns 一张卡住态，或 `undefined`。
 */
export function blockerOf(parts: {
  readonly error?: ApiError | undefined;
  readonly capability?: CapabilityPayload | undefined;
  readonly t: Translate;
  readonly platform?: string | undefined;
  readonly loginUrl?: string | undefined;
  readonly ask?: BlockerAsk | undefined;
}): ModuleBlocker | undefined {
  if (parts.capability !== undefined) {
    const fromCapability = blockerOfCapability(parts.capability, parts.t, parts.ask);
    if (fromCapability !== undefined) return fromCapability;
  }
  if (parts.error === undefined) return undefined;
  const isLogin = parts.error.code === 'auth-required' || parts.error.code === 'auth';
  const helpUrl = parts.error.helpUrl !== undefined || !isLogin ? parts.error.helpUrl : parts.loginUrl;
  const withHelp = helpUrl === undefined ? parts.error : { ...parts.error, helpUrl };
  return blockerOfError(withHelp, parts.t, {
    ...(parts.platform === undefined ? {} : { platform: parts.platform }),
    ...(parts.ask === undefined ? {} : { ask: parts.ask }),
  });
}

/**
 * 把宿主回的环境读数翻成卡住态：探针没查过（unchecked）只算提示，不挡卡片。
 * @param capability 宿主回的单元环境读数。
 * @param t 文案函数，键都在 env.unit.* / blocker.* 下。
 * @returns status 为 'ok' 时给 undefined（没有卡住态），其余状态一律给一张。
 */
export function blockerOfCapability(
  capability: CapabilityPayload,
  t: Translate,
  ask?: BlockerAsk,
): ModuleBlocker | undefined {
  if (capability.status === 'ok') return undefined;

  const problem = capability.needs.find((need) => need.status !== 'ok');
  const fix = problem?.provision === 'ready' ? 'install' : undefined;
  const fixAction: BlockerAction | undefined =
    fix === undefined
      ? undefined
      : {
          kind: 'run-fix',
          label: t('blocker.fix.install'),
          unit: capability.unit,
          fix,
        };
  const sourceUnknown = problem?.provision !== undefined && problem.provision !== 'ready';
  const install: readonly BlockerAction[] = [
    ...(fixAction === undefined ? [] : [fixAction]),
    ...(sourceUnknown ? [{ kind: 'open-market' as const, label: t('blocker.market.open'), unit: capability.unit }] : []),
    ...(problem?.command === undefined || sourceUnknown ? [] : [copyAction(t, problem.command)]),
  ];
  const detail = problem?.detail ?? capability.detail;

  if (capability.status === 'failed') {
    const title = t('env.unit.failed');
    const reason = firstLineOf(capability.detail);
    return cardBlocker({
      id: 'unit-mount-failed',
      severity: 'block',
      title,
      hint: t('env.unit.failedHint'),
      detail: capability.detail,
      actions: [
        askAgentActionOf(t, {
          ...askOf(t, ask),
          step: ask?.step ?? capability.unit,
          problem: { why: title, ...(reason === undefined ? {} : { reason }) },
        }),
        retryAction(t),
      ],
    });
  }

  if (capability.status === 'unsupported' || capability.status === 'degraded') {
    const notice = capability.status === 'degraded';
    return cardBlocker({
      id: notice ? 'unit-degraded' : 'unit-unsupported',
      severity: notice ? 'notice' : 'block',
      title: t(notice ? 'env.unit.degraded' : 'env.unit.unsupported'),
      hint: t(notice ? 'env.unit.degradedHint' : 'env.unit.unsupportedHint'),
      detail,
      actions: [retryAction(t)],
    });
  }

  if (problem === undefined || problem.status === 'unchecked') {
    return cardBlocker({
      id: 'unit-unchecked',
      severity: 'notice',
      title: t('env.unit.unchecked'),
      hint: t('env.unit.uncheckedHint'),
      detail: problem === undefined ? capability.detail : detail,
      actions: [retryAction(t)],
    });
  }

  const kindTitle = `env.need.${problem.kind}.${problem.status}`;
  return {
    id: `unit-need-${problem.kind}-${problem.status}`,
    severity: 'block',
    title: t(kindTitle),
    hint: t(`env.need.${problem.kind}.hint`),
    ...(detail === undefined ? {} : { detail }),
    actions: [...install, retryAction(t)],
  };
}
