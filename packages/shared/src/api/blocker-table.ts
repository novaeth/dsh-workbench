import type { Translate } from './dsh-client.js';
import type { CapabilityPayload } from './workbench-contract.js';
import type { ApiError } from './workbench-client.js';
import type { BlockerAction, ModuleBlocker } from './blocker.js';
import { shortenPath } from '../lib/ui.js';

function retryAction(t: Translate): BlockerAction {
  return { kind: 'retry', label: t('blocker.retry') };
}

function copyAction(t: Translate, text: string): BlockerAction {
  return { kind: 'copy', label: t('blocker.copy'), text };
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
  context: { path?: string | null; platform?: string } = {},
): ModuleBlocker {
  if (error === undefined) {
    return {
      id: 'unknown',
      severity: 'block',
      title: t('blocker.unknown.title'),
      actions: [retryAction(t)],
    };
  }

  switch (error.code) {
    case 'auth-required': {
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
        hint: error.hint ?? t('blocker.exec.hint'),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        actions: [retryAction(t)],
      };

    default:
      return {
        id: error.code,
        severity: 'block',
        title: error.message,
        ...(error.hint === undefined ? {} : { hint: error.hint }),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        actions: [retryAction(t)],
      };
  }
}

/**
 * 把宿主回的环境读数翻成卡住态：探针没查过（unchecked）只算提示，不挡卡片。
 * @param capability 宿主回的单元环境读数。
 * @param t 文案函数，键都在 env.unit.* / blocker.* 下。
 * @returns status 为 'ok' 时给 undefined（没有卡住态），其余状态一律给一张。
 */
export function blockerOfCapability(capability: CapabilityPayload, t: Translate): ModuleBlocker | undefined {
  if (capability.status === 'ok') return undefined;

  const fixAction: BlockerAction | undefined =
    capability.fix === undefined
      ? undefined
      : {
          kind: 'run-fix',
          label: capability.fix === 'install' ? t('blocker.fix.install') : t('blocker.fix.update'),
          unit: capability.unit,
          fix: capability.fix,
        };
  const sourceUnknown = capability.fix === undefined && capability.install !== undefined && capability.install !== 'ready';
  const install: readonly BlockerAction[] = [
    ...(fixAction === undefined ? [] : [fixAction]),
    ...(sourceUnknown ? [{ kind: 'open-market' as const, label: t('blocker.market.open'), unit: capability.unit }] : []),
    ...(capability.command === undefined || sourceUnknown ? [] : [copyAction(t, capability.command)]),
  ];

  if (capability.status === 'failed') {
    return {
      id: 'unit-mount-failed',
      severity: 'block',
      title: t('env.unit.failed'),
      hint: t('env.unit.failedHint'),
      ...(capability.detail === undefined ? {} : { detail: capability.detail }),
      actions: [retryAction(t)],
    };
  }

  if (capability.status === 'missing-plugin') {
    return {
      id: 'unit-missing-plugin',
      severity: 'block',
      title: t('env.unit.missingPlugin'),
      hint: t('env.unit.hint'),
      ...(capability.detail === undefined ? {} : { detail: capability.detail }),
      actions: [...install, retryAction(t)],
    };
  }

  if (capability.status === 'missing-commands') {
    return {
      id: 'unit-missing-commands',
      severity: 'block',
      title: t('env.unit.missingCommands'),
      hint: t('env.unit.missingCommandsHint'),
      ...(capability.detail === undefined ? {} : { detail: capability.detail }),
      actions: [...install, retryAction(t)],
    };
  }

  return {
    id: 'unit-unchecked',
    severity: 'notice',
    title: t('env.unit.unchecked'),
    hint: t('env.unit.uncheckedHint'),
    ...(capability.detail === undefined ? {} : { detail: capability.detail }),
    actions: [retryAction(t)],
  };
}
