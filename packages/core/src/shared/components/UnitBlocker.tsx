import { createElement as h } from 'react';
import type { ApiError, CapabilityPayload, Translate } from '@dsh-workbench/shared';
import { blockerOf } from '@dsh-workbench/shared';
import { BlockerState } from './BlockerState';

/**
 * `<UnitBlocker>` 的 prop：一份读口错误或能力读数，外加渲染要用的那几样。
 */
export interface UnitBlockerProps {
  readonly t: Translate;
  readonly error?: ApiError | undefined;
  readonly capability?: CapabilityPayload | undefined;
  readonly platform?: string | undefined;
  readonly loginUrl?: string | undefined;
  readonly onRetry: () => void;
  readonly busy?: boolean | undefined;
  readonly flush?: boolean | undefined;
  readonly onOpenMarket?: (() => void) | undefined;
}

/**
 * 把读口错误或能力读数翻成一张统一的阻断屏；两者都干净时不画任何东西。
 * @param props.t - 翻译函数；文案全部来自 `blocker.*` 与 `env.*`。
 * @param props.error - 读口回的错；`auth-required` 会出「需要登录 + 去登录」，`permission-denied` 出「没有权限」。
 * @param props.capability - 宿主回的单元环境读数；`ok` 时忽略，其余状态出一张阻断或提示。
 * @param props.platform - 平台名；给了就用「需要登录 {平台}」那一句。
 * @param props.loginUrl - 登录地址；`error.helpUrl` 没给时用它补上。
 * @param props.onRetry - 重试与修复成功后的回调。
 * @param props.busy - 外层是否在忙（默认 `false`）；为真时动作一并禁用。
 * @param props.flush - 贴着卡片边渲染（默认 `false`）：去图标、收窄留白。
 * @param props.onOpenMarket - 市场动作的回调；没给就退回 `onRetry`。
 * @returns 一个 `BlockerState`，或 `null`。
 */
export function UnitBlocker({
  t,
  error,
  capability,
  platform,
  loginUrl,
  onRetry,
  busy = false,
  flush = false,
  onOpenMarket,
}: UnitBlockerProps) {
  const blocker = blockerOf({ error, capability, t, platform, loginUrl });
  if (blocker === undefined) return null;
  return (
    <BlockerState
      blocker={blocker}
      t={t}
      busy={busy}
      flush={flush}
      onRetry={onRetry}
      {...(onOpenMarket === undefined ? {} : { onOpenMarket })}
    />
  );
}
