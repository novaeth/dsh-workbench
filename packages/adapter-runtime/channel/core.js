export const API_VERSION = 1;

export const DEFAULT_TIMEOUT_MS = 25_000;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_MAX_BYTES = 8 * 1024 * 1024;

const CREDENTIAL_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
];

function fail(code, message) {
  return { ok: false, code, message };
}

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function textOf(value) {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value);
}

function positiveIntOf(value, fallback, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`不是正整数：${String(value)}`);
  if (max !== undefined && number > max) throw new Error(`超过上限 ${max}：${String(value)}`);
  return number;
}

export function apiProblemOf(value) {
  return Number(value) === API_VERSION
    ? undefined
    : `这条通道只认 --api ${API_VERSION}，收到 ${textOf(value) || '（空）'}：壳与插件的版本对不上`;
}

export function headersOf(raw) {
  const text = textOf(raw);
  if (text === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('--headers 不是合法 JSON');
  }
  const record = asRecord(parsed);
  if (record === undefined) throw new Error('--headers 要是对象');
  const out = {};
  for (const [name, value] of Object.entries(record)) {
    if (name.trim() === '') throw new Error('--headers 的键不能为空');
    if (typeof value !== 'string') throw new Error(`--headers.${name} 要是字符串`);
    if (CREDENTIAL_HEADERS.includes(name.toLowerCase())) {
      throw new Error(`--headers 里不许写凭据头 ${name}：凭据只能走 --jar / --cookie`);
    }
    out[name] = value;
  }
  return out;
}

export function urlOf(raw) {
  const text = textOf(raw);
  if (text === '') throw new Error('--url 不能为空');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`--url 不是合法地址：${text}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('--url 只认 http(s)');
  return url;
}

export function domainsOf(url) {
  const labels = url.hostname.split('.');
  return labels.length > 2 ? [url.hostname, labels.slice(1).join('.')] : [url.hostname];
}

export async function jarOf(page, url) {
  const jar = new Map();
  for (const domain of domainsOf(url)) {
    const cookies = await page.getCookies({ domain });
    for (const cookie of cookies ?? []) {
      if (typeof cookie?.name !== 'string' || typeof cookie.value !== 'string') continue;
      if (!jar.has(cookie.name)) jar.set(cookie.name, cookie.value);
    }
  }
  return jar;
}

function cookieHeaderOf(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

export function placeOf(raw) {
  const text = textOf(raw);
  if (text === '') return undefined;
  const at = text.indexOf(':');
  if (at <= 0) throw new Error(`--place 要是 header:<名> / query:<名> / body:<字段>，收到 ${text}`);
  const where = text.slice(0, at);
  const name = text.slice(at + 1);
  if (name === '') throw new Error('--place 的键不能为空');
  if (where !== 'header' && where !== 'query' && where !== 'body') {
    throw new Error(`不认识的 --place：${where}（只认 header / query / body）`);
  }
  if (where === 'body' && name.includes('.')) {
    throw new Error('--place body 只放顶层字段');
  }
  return { where, name };
}

function setBodyField(body, contentType, field, token) {
  if (contentType === 'form') {
    const params = new URLSearchParams(body === undefined ? '' : body);
    params.set(field, token);
    return params.toString();
  }
  let parsed;
  try {
    parsed = body === undefined || body === '' ? {} : JSON.parse(body);
  } catch {
    throw new Error('--place body 需要 --body 是 JSON 对象');
  }
  const record = asRecord(parsed);
  if (record === undefined) throw new Error('--place body 需要 --body 是 JSON 对象');
  record[field] = token;
  return JSON.stringify(record);
}

function contentTypeOf(raw) {
  const text = textOf(raw);
  if (text === '' || text === 'json') return 'json';
  if (text === 'form') return 'form';
  throw new Error(`--content-type 只认 json / form，收到 ${text}`);
}

function tokenOf(jar, kwargs) {
  const name = textOf(kwargs.cookie);
  if (name === '') return undefined;
  if (jar === undefined) throw new Error('--cookie 要配上 --jar cookie');
  const token = jar.get(name);
  if (token === undefined || token === '') {
    throw new Error(`登录态里没有 cookie ${name}（可能是未登录，或者名字不对）`);
  }
  return token;
}

export async function perform(page, kwargs, method) {
  const apiProblem = apiProblemOf(kwargs.api);
  if (apiProblem !== undefined) throw new Error(apiProblem);
  const url = urlOf(kwargs.url);
  const headers = headersOf(kwargs.headers);
  const jarMode = textOf(kwargs.jar || 'cookie');
  if (jarMode !== 'cookie' && jarMode !== 'none') throw new Error(`--jar 只认 cookie / none，收到 ${jarMode}`);
  const timeoutMs = positiveIntOf(kwargs.timeout, DEFAULT_TIMEOUT_MS);
  const maxBytes = positiveIntOf(kwargs.maxBytes, DEFAULT_MAX_BYTES, MAX_MAX_BYTES);
  const contentType = contentTypeOf(kwargs.contentType);
  const place = placeOf(kwargs.place);
  const prefix = textOf(kwargs.prefix);

  const jar = jarMode === 'cookie' ? await jarOf(page, url) : undefined;
  if (jar !== undefined) {
    const cookie = cookieHeaderOf(jar);
    if (cookie !== '') headers['cookie'] = cookie;
  }

  const token = tokenOf(jar, kwargs);
  let body = textOf(kwargs.body) === '' ? undefined : String(kwargs.body);
  let href = url.toString();

  if (token !== undefined) {
    if (place === undefined) throw new Error('给了 --cookie 就要给 --place');
    if (place.where === 'header') headers[place.name] = prefix + token;
    else if (place.where === 'query') {
      const query = new URLSearchParams(url.search);
      query.set(place.name, token);
      url.search = query.toString();
      href = url.toString();
    } else {
      body = setBodyField(body, contentType, place.name, token);
    }
  }

  if (body !== undefined && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
    headers['content-type'] = contentType === 'form' ? 'application/x-www-form-urlencoded' : 'application/json';
  }

  let response;
  try {
    response = await fetch(href, {
      method,
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      ...(body === undefined ? {} : { body }),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') return fail('timeout', `超过 ${Math.round(timeoutMs / 1000)} 秒没有返回`);
    return fail('fetch-failed', error?.message || String(error));
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return fail('too-large', `返回超过 ${Math.round(maxBytes / 1024)} KB`);
  }
  if (response.status === 401 || response.status === 403) return fail('not-logged-in', `HTTP ${response.status}`);
  if (!response.ok) return fail(`http-${response.status}`, text.slice(0, 200));

  const kind = textOf(kwargs.kind) === 'text' ? 'text' : 'json';
  if (kind === 'text') return { ok: true, text };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return fail('shape', '返回的不是 JSON（可能跳到登录页了）');
  }
}

export function argOf(name, extra = {}) {
  return { name, ...extra };
}

export const SHARED_ARGS = [
  argOf('api', { type: 'int', required: true, help: '通道协议版本（壳与插件对表用）' }),
  argOf('url', { required: true, help: '绝对地址（http/https）' }),
  argOf('jar', { default: 'cookie', help: 'cookie：带浏览器登录态；none：不带' }),
  argOf('cookie', { help: '从登录态里取这一格的值当凭据（cookieValue 来源）' }),
  argOf('place', { help: '凭据放哪：header:<名> / query:<名> / body:<字段>' }),
  argOf('prefix', { help: '放在头里时的前缀，例如 "Bearer "' }),
  argOf('headers', { help: '额外请求头（JSON；不许写凭据头）' }),
  argOf('kind', { default: 'json', help: '响应形状：json / text' }),
  argOf('timeout', { type: 'int', default: DEFAULT_TIMEOUT_MS, help: '超时毫秒' }),
  argOf('maxBytes', { type: 'int', default: DEFAULT_MAX_BYTES, help: '响应体上限（字节）' }),
];
