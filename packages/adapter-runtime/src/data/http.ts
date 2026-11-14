import type { DataCallOptions, DataErrorCode, DataRequest, DataResult } from '@dsh-workbench/shared/host';
import { failure, parse } from './result.js';

export const DEFAULT_TIMEOUT_MS = 20_000;

export async function readHttp(
  request: Extract<DataRequest, { kind: 'http' }>,
  callOptions: DataCallOptions,
  fetchOf: typeof fetch | undefined,
): Promise<DataResult<unknown>> {
  if (fetchOf === undefined) return failure('invalid-request', '这个运行时没有 fetch');
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal =
    callOptions.signal === undefined ? controller.signal : AbortSignal.any([callOptions.signal, controller.signal]);
  try {
    const response = await fetchOf(request.url, {
      method: 'GET',
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const code: DataErrorCode =
        response.status === 401 ? 'auth' : response.status === 403 ? 'permission-denied' : 'http';
      return failure(code, `HTTP ${response.status}`, {
        status: response.status,
        detail: text.slice(0, 2000),
      });
    }
    return parse(text);
  } catch (error) {
    if (callOptions.signal?.aborted === true) return failure('aborted', '已停止', { pageCode: 'aborted' });
    if (controller.signal.aborted) return failure('timeout', `读超时（${timeoutMs}ms）`);
    return failure('http', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
