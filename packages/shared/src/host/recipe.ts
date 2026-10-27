import type { CallOverrides, RecipeAuth, RecipeCalls, RequestRecipe } from '../contract/data.js';
import { callsProblemOf, DEFAULT_RECIPE_MAX_BYTES, recipeProblemOf } from './recipe-rules.js';

export interface RecipeDescription {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
  readonly auth?:
    | {
        readonly source: string;
        readonly place: string;
        readonly name?: string;
      }
    | undefined;
}


function authOf(recipe: RequestRecipe): RecipeAuth {
  return recipe.auth ?? { source: { kind: 'cookie' }, place: { in: 'cookie' } };
}

function needsToken(auth: RecipeAuth): boolean {
  return auth.kind !== 'none' && auth.source.kind !== 'cookie';
}

function mergedHeaders(recipe: RequestRecipe, overrides: CallOverrides): Record<string, string> {
  return { ...(recipe.request.headers ?? {}), ...(overrides.headers ?? {}) };
}

function mergedQuery(recipe: RequestRecipe, overrides: CallOverrides): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(recipe.request.query ?? {})) query[name] = String(value);
  for (const [name, value] of Object.entries(overrides.query ?? {})) query[name] = String(value);
  return query;
}

function baseUrlOf(recipe: RequestRecipe, overrides: CallOverrides): string {
  const path = overrides.path ?? recipe.request.path;
  return path.startsWith('/') ? `${recipe.origin}${path}` : path;
}

function urlOf(recipe: RequestRecipe, overrides: CallOverrides): string {
  const url = new URL(baseUrlOf(recipe, overrides));
  for (const [name, value] of Object.entries(mergedQuery(recipe, overrides))) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

function responseOf(
  recipe: RequestRecipe,
  overrides: CallOverrides,
): { kind: 'json' | 'text'; path: string | undefined; maxBytes: number } {
  const base = recipe.response;
  const extra = overrides.response ?? {};
  return {
    kind: extra.kind ?? base?.kind ?? 'json',
    path: extra.path ?? base?.path,
    maxBytes: extra.maxBytes ?? base?.maxBytes ?? DEFAULT_RECIPE_MAX_BYTES,
  };
}

function bodyOf(recipe: RequestRecipe, overrides: CallOverrides): unknown {
  return overrides.body !== undefined ? overrides.body : recipe.request.body;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function literal(value: unknown): string {
  return JSON.stringify(value);
}

function encodedBody(value: unknown): string {
  return typeof value === 'string' ? literal(value) : `JSON.stringify(${literal(value)})`;
}

function tokenLines(recipe: RequestRecipe, auth: RecipeAuth): string[] {
  if (!needsToken(auth)) return [];
  const source = auth.kind === 'none' ? undefined : auth.source;
  if (source === undefined) return [];
  if (source.kind === 'cookieValue') {
    return [
      '  const cookie = (name) => {',
      '    const hit = document.cookie.split("; ").find((one) => one.startsWith(name + "="));',
      '    return hit === undefined ? "" : decodeURIComponent(hit.slice(name.length + 1));',
      '  };',
      `  const token = cookie(${quote(source.name)});`,
      '  if (token === "") return { ok: false, code: "auth-failed", message: "页面里没有这个 cookie" };',
    ];
  }
  if (source.kind === 'meta') {
    return [
      `  const meta = document.querySelector(${quote(`meta[name="${source.name}"]`)});`,
      '  const token = meta === null ? "" : (meta.getAttribute("content") || "");',
      '  if (token === "") return { ok: false, code: "auth-failed", message: "页面里没有这个 meta" };',
    ];
  }
  if (source.kind === 'global') {
    return [
      `  const token = pick(globalThis, ${quote(source.path)});`,
      '  if (typeof token !== "string" || token === "") return { ok: false, code: "auth-failed", message: "页面里没有这个全局变量" };',
    ];
  }
  if (source.kind === 'storage') {
    const store = source.area === 'local' ? 'localStorage' : 'sessionStorage';
    const path = source.path === undefined ? '' : source.path;
    return [
      `  const raw = ${store}.getItem(${quote(source.key)});`,
      '  let parsed = raw;',
      '  try { parsed = raw === null ? null : JSON.parse(raw); } catch (error) { parsed = raw; }',
      path === ''
        ? '  const token = parsed;'
        : `  const token = pick(parsed, ${quote(path)});`,
      '  if (typeof token !== "string" || token === "") return { ok: false, code: "auth-failed", message: "页面里没有这个 token" };',
    ];
  }
  if (source.kind === 'endpoint') {
    const method = source.method ?? 'GET';
    const hasBody = source.body !== undefined;
    const endpointUrl = source.url.startsWith('/') ? `${recipe.origin}${source.url}` : source.url;
    const lines = [
      '  let pre;',
      '  try {',
      `    pre = await fetch(${quote(endpointUrl)}, { method: ${quote(method)}, credentials: "include", headers: { "content-type": "application/json" }${hasBody ? `, body: ${encodedBody(source.body)}` : ''} });`,
      '  } catch (error) {',
      '    return { ok: false, code: "fetch-failed", message: String(error) };',
      '  }',
      '  if (pre.status === 401 || pre.status === 403) return { ok: false, code: "not-logged-in" };',
      '  const preText = await pre.text();',
      '  if (!pre.ok) return { ok: false, code: "http-" + pre.status, message: preText.slice(0, 200) };',
      '  let preJson;',
      '  try { preJson = JSON.parse(preText); } catch (error) {',
      '    return { ok: false, code: "shape", message: "换登录态时返回的不是 JSON" };',
      '  }',
      `  const token = pick(preJson, ${quote(source.path)});`,
      '  if (typeof token !== "string" || token === "") return { ok: false, code: "auth-failed", message: "换登录态时没拿到 token" };',
    ];
    return lines;
  }
  return [];
}

function fetchLine(recipe: RequestRecipe, hasBody: boolean): string {
  return `    res = await fetch(url, { method: ${quote(recipe.request.method)}, credentials: "include", headers${hasBody ? ', body' : ''} });`;
}

export function scriptOf(recipe: RequestRecipe, overrides: CallOverrides = {}): string {
  const problem = recipeProblemOf(recipe, overrides);
  if (problem !== undefined) throw new Error(problem);
  const auth = authOf(recipe);
  const body = bodyOf(recipe, overrides);
  const contentType = recipe.request.contentType ?? 'json';
  const place = auth.kind === 'none' ? undefined : auth.place;
  const bodyPlace = place?.in === 'body' ? place : undefined;
  const hasBody = body !== undefined || bodyPlace !== undefined;
  const headers = mergedHeaders(recipe, overrides);
  const headerNames = Object.keys(headers).map((name) => name.toLowerCase());
  if (hasBody && !headerNames.includes('content-type')) {
    headers['content-type'] = contentType === 'form' ? 'application/x-www-form-urlencoded' : 'application/json';
  }
  const url = urlOf(recipe, overrides);
  const { kind: responseKind, path: responsePath, maxBytes } = responseOf(recipe, overrides);
  const lines: string[] = [];
  lines.push('(async () => {');
  lines.push(`  if (location.origin !== ${quote(recipe.origin)}) return { ok: false, code: "not-on-site" };`);
  lines.push(
    '  const pick = (value, path) => path.split(".").reduce((one, key) => (one === null || one === undefined ? one : one[key]), value);',
  );
  lines.push(
    '  const set = (target, path, value) => { const parts = path.split("."); let at = target; for (let index = 0; index < parts.length - 1; index += 1) { const key = parts[index]; if (at[key] === null || typeof at[key] !== "object") at[key] = {}; at = at[key]; } at[parts[parts.length - 1]] = value; return target; };',
  );
  lines.push(...tokenLines(recipe, auth));
  lines.push(`  const headers = ${literal(headers)};`);
  if (place?.in === 'header' && needsToken(auth)) {
    lines.push(`  headers[${quote(place.name)}] = ${quote(place.prefix ?? '')} + token;`);
  }
  if (hasBody) {
    if (contentType === 'form') {
      lines.push(`  const body = new URLSearchParams(${literal(body ?? {})});`);
      if (bodyPlace !== undefined) lines.push(`  body.set(${quote(bodyPlace.field)}, token);`);
    } else {
      lines.push(`  let body = ${literal(body ?? {})};`);
      if (bodyPlace !== undefined) lines.push(`  set(body, ${quote(bodyPlace.field)}, token);`);
      lines.push('  if (typeof body !== "string") body = JSON.stringify(body);');
    }
  }
  lines.push(`  let url = ${quote(url)};`);
  if (place?.in === 'query' && needsToken(auth)) {
    lines.push(
      `  url += (url.indexOf("?") === -1 ? "?" : "&") + ${quote(`${place.name}=`)} + encodeURIComponent(token);`,
    );
  }
  lines.push('  let res;');
  lines.push('  try {');
  lines.push(fetchLine(recipe, hasBody));
  lines.push('  } catch (error) {');
  lines.push('    return { ok: false, code: "fetch-failed", message: String(error) };');
  lines.push('  }');
  lines.push('  const text = await res.text();');
  lines.push(
    `  if (new TextEncoder().encode(text).length > ${maxBytes}) return { ok: false, code: "too-large", message: "返回超过 ${Math.round(maxBytes / 1024)} KB" };`,
  );
  lines.push('  if (!res.ok) return { ok: false, code: "http-" + res.status, message: text.slice(0, 200) };');
  if (responseKind === 'text') {
    lines.push('  return { ok: true, text };');
  } else {
    lines.push('  let data;');
    lines.push('  try {');
    lines.push('    data = JSON.parse(text);');
    lines.push('  } catch (error) {');
    lines.push('    return { ok: false, code: "shape", message: "返回的不是 JSON（可能跳到登录页了）" };');
    lines.push('  }');
    if (responsePath === undefined) {
      lines.push('  return { ok: true, data };');
    } else {
      lines.push(`  const value = pick(data, ${quote(responsePath)});`);
      lines.push(
        `  if (value === undefined) return { ok: false, code: "shape", message: "返回里没有 ${responsePath} 这一格" };`,
      );
      lines.push('  return { ok: true, data: value };');
    }
  }
  lines.push('})()');
  return lines.join('\n');
}

export function describeRecipe(recipe: RequestRecipe, overrides: CallOverrides = {}): RecipeDescription {
  const problem = recipeProblemOf(recipe, overrides);
  if (problem !== undefined) throw new Error(problem);
  const auth = authOf(recipe);
  const body = bodyOf(recipe, overrides);
  const placement = auth.kind === 'none' ? undefined : auth.place;
  const name =
    placement === undefined || placement.in === 'cookie'
      ? undefined
      : placement.in === 'body'
        ? placement.field
        : placement.name;
  return {
    method: recipe.request.method,
    url: urlOf(recipe, overrides),
    ...(body === undefined ? {} : { body }),
    ...(placement === undefined
      ? {}
      : {
          auth: {
            source: auth.kind === 'none' ? 'none' : auth.source.kind,
            place: placement.in,
            ...(name === undefined ? {} : { name }),
          },
        }),
  };
}


export function scriptOfMany(recipe: RequestRecipe, calls: RecipeCalls): string {
  const problem = callsProblemOf(recipe, calls);
  if (problem !== undefined) throw new Error(problem);
  if (recipe.request.method !== 'GET') throw new Error('批量读只认 GET，写一条一条走 submit');
  const auth = authOf(recipe);
  const place = auth.kind === 'none' ? undefined : auth.place;
  if (place?.in === 'body') throw new Error('批量读不带 body 里的凭据');
  const lines: string[] = [];
  lines.push('(async () => {');
  lines.push(`  if (location.origin !== ${quote(recipe.origin)}) return { ok: false, code: "not-on-site" };`);
  lines.push(
    '  const pick = (value, path) => path.split(".").reduce((one, key) => (one === null || one === undefined ? one : one[key]), value);',
  );
  lines.push(...tokenLines(recipe, auth));
  lines.push(`  const headers = ${literal(recipe.request.headers ?? {})};`);
  if (place?.in === 'header' && needsToken(auth)) {
    lines.push(`  headers[${quote(place.name)}] = ${quote(place.prefix ?? '')} + token;`);
  }
  if (place?.in === 'query' && needsToken(auth)) {
    lines.push(
      `  const withToken = (url) => url + (url.indexOf("?") === -1 ? "?" : "&") + ${quote(`${place.name}=`)} + encodeURIComponent(token);`,
    );
  } else {
    lines.push('  const withToken = (url) => url;');
  }
  lines.push('  const one = async (url, headers, kind, path, maxBytes) => {');
  lines.push('    let res;');
  lines.push('    try {');
  lines.push('      res = await fetch(url, { method: "GET", credentials: "include", headers });');
  lines.push('    } catch (error) {');
  lines.push('      return { ok: false, code: "fetch-failed", message: String(error) };');
  lines.push('    }');
  lines.push('    const text = await res.text();');
  lines.push(
    '    if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, code: "too-large", message: "返回超过 " + Math.round(maxBytes / 1024) + " KB" };',
  );
  lines.push('    if (!res.ok) return { ok: false, code: "http-" + res.status, message: text.slice(0, 200) };');
  lines.push('    if (kind === "text") return { ok: true, text };');
  lines.push('    let data;');
  lines.push('    try {');
  lines.push('      data = JSON.parse(text);');
  lines.push('    } catch (error) {');
  lines.push('      return { ok: false, code: "shape", message: "返回的不是 JSON（可能跳到登录页了）" };');
  lines.push('    }');
  lines.push('    if (path === null) return { ok: true, data };');
  lines.push('    const value = pick(data, path);');
  lines.push('    if (value === undefined) return { ok: false, code: "shape", message: "返回里没有 " + path + " 这一格" };');
  lines.push('    return { ok: true, data: value };');
  lines.push('  };');
  lines.push('  const results = {};');
  lines.push('  await Promise.all([');
  for (const [name, call] of Object.entries(calls)) {
    const extra = call.headers ?? {};
    const headersArg =
      Object.keys(extra).length === 0 ? 'headers' : `Object.assign({}, headers, ${literal(extra)})`;
    const { kind, path, maxBytes } = responseOf(recipe, call);
    const pathArg = path === undefined ? 'null' : quote(path);
    lines.push(
      `    one(withToken(${quote(urlOf(recipe, call))}), ${headersArg}, ${quote(kind)}, ${pathArg}, ${maxBytes}).then((result) => { results[${quote(name)}] = result; }),`,
    );
  }
  lines.push('  ]);');
  lines.push('  return { ok: true, results };');
  lines.push('})()');
  return lines.join('\n');
}
