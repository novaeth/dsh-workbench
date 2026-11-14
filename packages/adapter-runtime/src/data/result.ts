import type { DataError, DataErrorCode, DataFailure, DataResult } from '@dsh-workbench/shared/host';
import type { BrowserReadResult } from '../browser/index.js';

export function failure(code: DataErrorCode, message: string, extra: Partial<DataError> = {}): DataFailure {
  return { ok: false, error: { code, message, ...extra } };
}

export function parse(text: string): DataResult<unknown> {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return failure('parse', '返回的不是 JSON', { detail: text.slice(0, 2000) });
  }
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function dataCodeOf(pageCode: string): DataErrorCode {
  const code = pageCode.trim().toUpperCase().replace(/-/g, '_');
  if (
    code === 'NOT_LOGGED_IN' ||
    code === 'AUTH_FAILED' ||
    code === 'AUTH_REQUIRED' ||
    code === 'UNAUTHORIZED' ||
    code === 'UNAUTHENTICATED' ||
    code.includes('UNAUTH')
  ) {
    return 'auth';
  }
  if (code === 'PERMISSION_DENIED' || code === 'FORBIDDEN' || code === 'NO_PERMISSION') {
    return 'permission-denied';
  }
  if (code === 'TIMEOUT' || code === 'CLI_TIMEOUT') return 'timeout';
  if (code === 'ABORTED' || code === 'CANCELLED') return 'aborted';
  if (code === 'HTTP_403') return 'permission-denied';
  if (/^HTTP_\d{3}$/.test(code)) return 'http';
  if (code === 'PARSE' || code === 'SHAPE') return 'parse';
  return 'browser';
}

function statusOf(pageCode: string): number | undefined {
  const match = /^http-(\d{3})$/i.exec(pageCode.trim());
  return match === null ? undefined : Number(match[1]);
}

export function browserFailure(result: BrowserReadResult, loginUrl?: string): DataFailure {
  const pageCode = result.pageCode ?? result.code;
  const mapped = dataCodeOf(result.code);
  const code = mapped === 'browser' ? dataCodeOf(pageCode) : mapped;
  const status = statusOf(result.code) ?? statusOf(pageCode);
  const helpUrl = result.helpUrl ?? (code === 'auth' ? loginUrl : undefined);
  return {
    ok: false,
    error: {
      code,
      message: result.message,
      ...(status === undefined ? {} : { status }),
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      ...(result.hint === undefined ? {} : { hint: result.hint }),
      ...(helpUrl === undefined ? {} : { helpUrl }),
      ...(pageCode === '' ? {} : { pageCode }),
    },
  };
}

export function pageFailure(pageCode: string, message: string, loginUrl?: string): DataFailure {
  const code = dataCodeOf(pageCode);
  const status = statusOf(pageCode);
  const helpUrl = code === 'auth' ? loginUrl : undefined;
  return {
    ok: false,
    error: {
      code,
      message,
      ...(status === undefined ? {} : { status }),
      ...(helpUrl === undefined ? {} : { helpUrl }),
      ...(pageCode === '' ? {} : { pageCode }),
    },
  };
}

export function pickOf(value: unknown, path: string): unknown {
  let at: unknown = value;
  for (const key of path.split('.')) {
    const box = asRecord(at);
    if (box === undefined) return undefined;
    at = box[key];
  }
  return at;
}

export function allFailure(
  names: readonly string[],
  code: DataErrorCode,
  message: string,
  extra: Partial<DataError> = {},
): Record<string, DataResult<never>> {
  const out: Record<string, DataResult<never>> = {};
  for (const name of names) out[name] = { ok: false, error: { code, message, ...extra } };
  return out;
}
