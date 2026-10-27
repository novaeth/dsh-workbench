import type { CallOverrides, CredentialSource, RecipeAuth, RequestRecipe } from '../contract/data.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const RESPONSE_KINDS = ['json', 'text'];
const CONTENT_TYPES = ['json', 'form'];
const CREDENTIAL_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
];
export const DEFAULT_RECIPE_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_RECIPE_CALLS = 8;
const MAX_MAX_BYTES = 8 * 1024 * 1024;


function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function httpOriginProblem(value: unknown): string | undefined {
  const text = textOf(value);
  if (text === '') return 'origin 不能为空';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'origin 只认 http(s)';
    if (url.origin !== text) return 'origin 只写到域（不带路径、不带尾斜杠）';
  } catch {
    return `origin 不是合法地址：${text}`;
  }
  return undefined;
}

function relativePathProblem(value: unknown, label: string): string | undefined {
  const text = textOf(value);
  if (text === '') return `${label} 不能为空`;
  if (text.includes('\\')) return `${label} 里不许有反斜杠`;
  if (text.startsWith('//')) return `${label} 不许用协议相对地址`;
  if (text.includes('?') || text.includes('#')) return `${label} 不带查询 / 锚点，参数走 query`;
  if (!text.startsWith('/')) return `${label} 要以 / 开头`;
  return undefined;
}

function absoluteUrlProblem(value: unknown, label: string): string | undefined {
  const text = textOf(value);
  if (text === '') return `${label} 不能为空`;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${label} 只认 http(s)`;
  } catch {
    return `${label} 不是合法地址：${text}`;
  }
  return undefined;
}

function requestPathProblem(value: unknown, origin: string, label: string): string | undefined {
  const text = textOf(value);
  const relative = relativePathProblem(value, label);
  if (relative === undefined) return undefined;
  if (text.startsWith('/') || text.startsWith('//') || text.includes('\\') || text.includes('?') || text.includes('#')) {
    return relative;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${label} 只认 http(s)`;
    if (url.origin !== origin) return `${label} 要和 origin 同源`;
  } catch {
    return `${label} 要以 / 开头，或者是同源的绝对地址`;
  }
  return undefined;
}

function resolvedUrlProblem(value: unknown, origin: string, label: string): string | undefined {
  const text = textOf(value);
  if (text === '') return `${label} 不能为空`;
  if (text.startsWith('//')) return `${label} 不许用协议相对地址`;
  return absoluteUrlProblem(text.startsWith('/') ? `${origin}${text}` : text, label);
}

function queryProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const map = recordOf(value);
  if (map === undefined) return 'query 要是对象';
  for (const [name, entry] of Object.entries(map)) {
    if (name.trim() === '') return 'query 的键不能为空';
    if (typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean') {
      return `query.${name} 只能是字符串 / 数字 / 布尔`;
    }
  }
  return undefined;
}

function headersProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const map = recordOf(value);
  if (map === undefined) return 'headers 要是对象';
  for (const [name, entry] of Object.entries(map)) {
    if (name.trim() === '') return 'headers 的键不能为空';
    if (typeof entry !== 'string') return `headers.${name} 要是字符串`;
    if (CREDENTIAL_HEADERS.includes(name.toLowerCase())) {
      return `headers 里不许写凭据头 ${name} —— 凭据走 auth.place`;
    }
  }
  return undefined;
}

function bodyProblem(value: unknown, contentType: string): string | undefined {
  if (value === undefined) return undefined;
  if (contentType === 'form') {
    const map = recordOf(value);
    if (map === undefined) return 'contentType: form 时 body 要是对象';
    for (const [name, entry] of Object.entries(map)) {
      if (typeof entry !== 'string') return `contentType: form 时 body.${name} 要是字符串`;
    }
    return undefined;
  }
  try {
    JSON.stringify(value);
  } catch {
    return 'body 要能 JSON 序列化';
  }
  return undefined;
}

function sourceProblem(value: unknown, origin: string): string | undefined {
  const source = recordOf(value);
  if (source === undefined) return 'auth.source 要是对象';
  const kind = textOf(source['kind']);
  if (kind === 'cookie') return undefined;
  if (kind === 'cookieValue') {
    return textOf(source['name']) === '' ? 'auth.source.name 不能为空' : undefined;
  }
  if (kind === 'meta') {
    return textOf(source['name']) === '' ? 'auth.source.name 不能为空' : undefined;
  }
  if (kind === 'global') {
    return textOf(source['path']) === '' ? 'auth.source.path 不能为空' : undefined;
  }
  if (kind === 'storage') {
    if (textOf(source['area']) !== 'local' && textOf(source['area']) !== 'session') {
      return 'auth.source.area 只认 local / session';
    }
    return textOf(source['key']) === '' ? 'auth.source.key 不能为空' : undefined;
  }
  if (kind === 'endpoint') {
    const urlIssue = resolvedUrlProblem(source['url'], origin, 'auth.source.url');
    if (urlIssue !== undefined) return urlIssue;
    const method = textOf(source['method']);
    if (method !== '' && method !== 'GET' && method !== 'POST') {
      return 'auth.source.method 只认 GET / POST';
    }
    if (textOf(source['path']) === '') return 'auth.source.path（token 在返回里的位置）不能为空';
    return bodyProblem(source['body'], 'json');
  }
  return `不认识的 auth.source.kind：${kind === '' ? '（空）' : kind}`;
}

function placeProblem(value: unknown, source: CredentialSource | undefined): string | undefined {
  const place = recordOf(value);
  if (place === undefined) return 'auth.place 要是对象';
  const where = textOf(place['in']);
  if (where === 'cookie') {
    if (source !== undefined && source.kind !== 'cookie') {
      return '凭据不是 cookie，place.in 不能是 cookie';
    }
    return undefined;
  }
  if (where === 'header' || where === 'query') {
    if (textOf(place['name']) === '') return 'auth.place.name 不能为空';
    if (source !== undefined && source.kind === 'cookie') {
      return 'cookie 来源没有 token 可放，place.in 要写 cookie';
    }
    return undefined;
  }
  if (where === 'body') {
    if (textOf(place['field']) === '') return 'auth.place.field 不能为空';
    if (source !== undefined && source.kind === 'cookie') {
      return 'cookie 来源没有 token 可放，place.in 要写 cookie';
    }
    return undefined;
  }
  return `不认识的 auth.place.in：${where === '' ? '（空）' : where}`;
}

function authProblem(value: unknown, origin: string): string | undefined {
  if (value === undefined) return undefined;
  const auth = recordOf(value);
  if (auth === undefined) return 'auth 要是对象';
  if (textOf(auth['kind']) === 'none') {
    if (auth['source'] !== undefined || auth['place'] !== undefined) {
      return 'auth.kind: none 时不许带 source / place';
    }
    return undefined;
  }
  if (auth['kind'] !== undefined) return 'auth.kind 只认 none';
  const sourceIssue = sourceProblem(auth['source'], origin);
  if (sourceIssue !== undefined) return sourceIssue;
  return placeProblem(auth['place'], auth['source'] as CredentialSource);
}

function maxBytesProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 'response.maxBytes 要是正整数';
  if (value > MAX_MAX_BYTES) return `response.maxBytes 最大 ${MAX_MAX_BYTES}`;
  return undefined;
}

function responseProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const response = recordOf(value);
  if (response === undefined) return 'response 要是对象';
  const kind = textOf(response['kind']);
  if (!RESPONSE_KINDS.includes(kind)) return `response.kind 只认 ${RESPONSE_KINDS.join(' / ')}`;
  if (response['path'] !== undefined && textOf(response['path']) === '') return 'response.path 不能为空';
  return maxBytesProblem(response['maxBytes']);
}

function responseOverrideProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const response = recordOf(value);
  if (response === undefined) return 'response 要是对象';
  if (response['kind'] !== undefined && !RESPONSE_KINDS.includes(textOf(response['kind']))) {
    return `response.kind 只认 ${RESPONSE_KINDS.join(' / ')}`;
  }
  if (response['path'] !== undefined && textOf(response['path']) === '') return 'response.path 不能为空';
  return maxBytesProblem(response['maxBytes']);
}

function authOf(recipe: RequestRecipe): RecipeAuth {
  return recipe.auth ?? { source: { kind: 'cookie' }, place: { in: 'cookie' } };
}

function overridesProblem(recipe: RequestRecipe, overrides: CallOverrides): string | undefined {
  if (overrides.path !== undefined) {
    const pathIssue = requestPathProblem(overrides.path, recipe.origin, 'path');
    if (pathIssue !== undefined) return pathIssue;
  }
  const queryIssue = queryProblem(overrides.query);
  if (queryIssue !== undefined) return queryIssue;
  const headersIssue = headersProblem(overrides.headers);
  if (headersIssue !== undefined) return headersIssue;
  const responseIssue = responseOverrideProblem(overrides.response);
  if (responseIssue !== undefined) return responseIssue;
  const contentType = recipe.request.contentType ?? 'json';
  const bodyIssue = bodyProblem(overrides.body, contentType);
  if (bodyIssue !== undefined) return bodyIssue;
  if (overrides.body !== undefined && recipe.request.method === 'GET') {
    return 'GET 不带 body';
  }
  const auth = authOf(recipe);
  const place = auth.kind === 'none' ? undefined : auth.place;
  if (place?.in === 'body' && overrides.body !== undefined && recordOf(overrides.body) === undefined) {
    return 'auth.place 是 body 时 overrides.body 要是对象';
  }
  return undefined;
}


export function recipeProblemOf(recipe: unknown, overrides?: CallOverrides): string | undefined {
  const box = recordOf(recipe);
  if (box === undefined) return '配方要是对象';
  const originIssue = httpOriginProblem(box['origin']);
  if (originIssue !== undefined) return originIssue;
  const origin = textOf(box['origin']);
  if (box['loginUrl'] !== undefined) {
    const loginIssue = absoluteUrlProblem(box['loginUrl'], 'loginUrl');
    if (loginIssue !== undefined) return loginIssue;
  }
  if (box['session'] !== undefined && textOf(box['session']) === '') return 'session 不能为空';
  if (box['timeoutMs'] !== undefined) {
    const timeout = box['timeoutMs'];
    if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout <= 0) {
      return 'timeoutMs 要是正整数';
    }
  }
  const request = recordOf(box['request']);
  if (request === undefined) return 'request 要是对象';
  const method = textOf(request['method']);
  if (!METHODS.includes(method)) return `request.method 只认 ${METHODS.join(' / ')}`;
  const pathIssue = requestPathProblem(request['path'], origin, 'request.path');
  if (pathIssue !== undefined) return pathIssue;
  const queryIssue = queryProblem(request['query']);
  if (queryIssue !== undefined) return queryIssue;
  const headersIssue = headersProblem(request['headers']);
  if (headersIssue !== undefined) return headersIssue;
  const contentType = textOf(request['contentType']);
  if (contentType !== '' && !CONTENT_TYPES.includes(contentType)) {
    return `request.contentType 只认 ${CONTENT_TYPES.join(' / ')}`;
  }
  const bodyIssue = bodyProblem(request['body'], contentType === 'form' ? 'form' : 'json');
  if (bodyIssue !== undefined) return bodyIssue;
  if (request['body'] !== undefined && method === 'GET') return 'GET 不带 body';
  const authIssue = authProblem(box['auth'], origin);
  if (authIssue !== undefined) return authIssue;
  const auth = recordOf(box['auth']);
  const place = auth === undefined ? undefined : recordOf(auth['place']);
  if (place !== undefined && textOf(place['in']) === 'body' && request['body'] !== undefined) {
    if (recordOf(request['body']) === undefined) return 'auth.place 是 body 时 request.body 要是对象';
  }
  const responseIssue = responseProblem(box['response']);
  if (responseIssue !== undefined) return responseIssue;
  if (overrides === undefined) return undefined;
  return overridesProblem(recipe as RequestRecipe, overrides);
}

export function callsProblemOf(recipe: unknown, calls: unknown): string | undefined {
  const recipeIssue = recipeProblemOf(recipe);
  if (recipeIssue !== undefined) return recipeIssue;
  const box = recordOf(calls);
  if (box === undefined) return 'calls 要是对象，键就是结果名';
  const names = Object.keys(box);
  if (names.length === 0) return 'calls 不能为空';
  if (names.length > MAX_RECIPE_CALLS) return `一次最多 ${MAX_RECIPE_CALLS} 条 calls`;
  for (const name of names) {
    if (name.trim() === '') return 'calls 的键不能为空';
    if (recordOf(box[name]) === undefined) return `calls.${name} 要是对象`;
    const issue = overridesProblem(recipe as RequestRecipe, box[name] as CallOverrides);
    if (issue !== undefined) return `calls.${name}：${issue}`;
  }
  return undefined;
}

