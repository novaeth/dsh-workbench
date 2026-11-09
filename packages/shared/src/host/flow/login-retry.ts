import type { FlowAction, FlowActionContext } from './types.js';
import { now } from '../time.js';

/**
 * 认证失败后的重试口径：多久重试一次、最多等多久、怎么认认证错误、去哪登录。
 */
export interface LoginRetryOptions {
  readonly everyMs?: number | undefined;
  readonly maxMs?: number | undefined;
  readonly isAuthError?: ((error: unknown) => boolean) | undefined;
  readonly loginUrlOf?: ((error: unknown) => string | undefined) | undefined;
}

function fieldOf(error: unknown, key: string): string {
  if (typeof error !== 'object' || error === null) return '';
  const value = (error as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' ? value : '';
}

function defaultIsAuthError(error: unknown): boolean {
  const code = `${fieldOf(error, 'code')} ${fieldOf(error, 'pageCode')}`;
  const message = fieldOf(error, 'message');
  return /(^|[\s._-])(auth|login|unauthorized|unauthenticated)([\s._-]|$)|未登录|请先登录/i.test(
    `${code} ${message}`,
  );
}

function defaultLoginUrl(error: unknown): string | undefined {
  const direct = fieldOf(error, 'loginUrl') || fieldOf(error, 'helpUrl');
  return /^https?:\/\//i.test(direct) ? direct : undefined;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('已停止'));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('已停止'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new Error('已停止'));
      return;
    }
    signal.addEventListener('abort', () => reject(new Error('已停止')), { once: true });
  });
}

/**
 * 把一条流程动作包成「认证失败就等登录」：失败 → `context.login(url)` → 等一拍重试；
 * 超过 `maxMs` 不再重试，但动作继续等（run 停在 needs-login，不是 failed），直到用户停止。
 * @param action 原来的动作；它的返回值 / 非认证错误原样透出。
 * @param options 重试间隔、上限、认证判定与登录地址；默认 5s / 30min / 常见 auth 码与消息 / `loginUrl`、`helpUrl`。
 * @returns 一条同样签名的动作。
 */
export function withLoginRetry(
  action: FlowAction,
  options: LoginRetryOptions = {},
): FlowAction {
  const everyMs = options.everyMs ?? 5000;
  const maxMs = options.maxMs ?? 30 * 60 * 1000;
  const isAuthError = options.isAuthError ?? defaultIsAuthError;
  const loginUrlOf = options.loginUrlOf ?? defaultLoginUrl;

  return async (input, context: FlowActionContext) => {
    const startedAt = now();
    for (;;) {
      try {
        return await action(input, context);
      } catch (error) {
        if (context.signal.aborted) throw error;
        if (!isAuthError(error)) throw error;
        const url = loginUrlOf(error);
        if (url !== undefined) context.login(url);
        if (maxMs > 0 && now() - startedAt >= maxMs) {
          await waitForAbort(context.signal);
        }
        await sleep(everyMs, context.signal);
      }
    }
  };
}
