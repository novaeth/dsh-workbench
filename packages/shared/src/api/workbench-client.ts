import { API_PREFIX } from '../config/constants.js';

/**
 * 宿主读口 / 写口回的错误：code 给判据分档，message 给人看，helpUrl 有就去点。
 */
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly detail?: string;
  readonly hint?: string;
  readonly helpUrl?: string;
}

/**
 * 读口的统一响应：成了把载荷摊平在顶层，没成只有一条 ApiError。
 */
export type ApiResponse<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: ApiError };

/**
 * GET 的查询参数：值为 undefined 的键直接丢掉，不进 URL。
 */
export type Query = Record<string, string | number | boolean | undefined>;

/**
 * GET 的可选项；目前只有中止信号。
 */
export interface ApiGetOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * 打一条宿主读口。
 * @param route 路由，相对 API_PREFIX，不带前导斜杠。
 * @param query 查询参数，undefined 的值不序列化。
 * @param options 中止信号等。
 * @returns HTTP 不是 2xx 时给 ok: false（code 为 http）；响应体不是 JSON 会当场抛，调用点要接住。
 */
export async function apiGet<T>(
  route: string,
  query: Query = {},
  options: ApiGetOptions = {},
): Promise<ApiResponse<T>> {
  const { signal } = options;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const suffix = search.toString();
  const target = suffix === '' ? `${API_PREFIX}/${route}` : `${API_PREFIX}/${route}?${suffix}`;

  const response = await fetch(target, {
    method: 'GET',
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: { code: 'http', message: `宿主返回 HTTP ${response.status}` },
    };
  }

  return (await response.json()) as ApiResponse<T>;
}

/**
 * 打一条宿主写口。
 * @param route 路由，相对 API_PREFIX，不带前导斜杠。
 * @param body 请求体，按 JSON 序列化。
 * @returns HTTP 不是 2xx 时给 ok: false（code 为 http）；响应体不是 JSON 会当场抛。
 */
export async function apiPost<T>(route: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_PREFIX}/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { ok: false, error: { code: 'http', message: `宿主返回 HTTP ${response.status}` } };
  }

  return (await response.json()) as ApiResponse<T>;
}
