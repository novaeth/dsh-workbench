/**
 * 一条登录丢失结论：给模块先判断，再决定是否自己解析响应。
 */
export interface AuthLossNotice {
  readonly message: string;
  readonly loginUrl?: string;
}

const AUTH_WORDS = /登录|登陆|超时|会话|未授权|请重新|login|log in|session|expired|unauthorized|auth/i;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 认常见的登录丢失形状：401、`status:false` + 登录/超时文案、跳 `/login`（403 是没权限，不算登录丢失）。
 * `status:false` 单独出现不算，避免把业务错误误判成登录。
 * @param value 已解析的响应体。
 * @returns 命中时给消息与可选的登录地址；不命中 undefined。
 */
export function authLossOf(value: unknown): AuthLossNotice | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  const status = record['status'] ?? record['statusCode'];
  const numeric = typeof status === 'string' && status.trim() !== '' ? Number(status) : status;
  const message = textOf(
    record['message'] ?? record['msg'] ?? record['error'] ?? record['errorMessage'] ?? record['detail'],
  );
  const url = textOf(record['loginUrl'] ?? record['loginURL'] ?? record['url'] ?? record['redirect']);
  const loginUrl = /\/login(?:[?#]|$)/i.test(url) ? url : undefined;
  const needsLogin =
    record['status'] === false ||
    record['success'] === false ||
    record['loggedIn'] === false ||
    record['authenticated'] === false;
  if (numeric === 401) {
    return {
      message: message === '' ? `HTTP ${String(numeric)}` : message,
      ...(loginUrl === undefined ? {} : { loginUrl }),
    };
  }
  if (!needsLogin || !AUTH_WORDS.test(message)) return undefined;
  return { message, ...(loginUrl === undefined ? {} : { loginUrl }) };
}
