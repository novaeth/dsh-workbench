import { describe, expect, it } from 'vitest';
import type { CallOverrides, RequestRecipe } from '../contract/data.js';
import { describeRecipe, scriptOf, scriptOfMany } from './recipe.js';
import { callsProblemOf, MAX_RECIPE_CALLS, recipeProblemOf } from './recipe-rules.js';

const BASE: RequestRecipe = {
  origin: 'https://x.example.com',
  request: { method: 'GET', path: '/api/balance' },
};

describe('scriptOf · 六种配方', () => {
  it('公开：只判 origin 再 fetch，不带 token', () => {
    const script = scriptOf({ ...BASE, auth: { kind: 'none' } });
    expect(script.startsWith('(async () => {')).toBe(true);
    expect(script.endsWith('})()')).toBe(true);
    expect(script).toContain('if (location.origin !== "https://x.example.com")');
    expect(script).toContain('let url = "https://x.example.com/api/balance";');
    expect(script).toContain('credentials: "include"');
    expect(script).not.toContain('token');
  });

  it('cookie 是默认值：不换 token、不加头', () => {
    const script = scriptOf(BASE);
    expect(script).not.toContain('document.cookie');
    expect(script).not.toContain('const token');
    expect(script).toContain('const headers = {};');
  });

  it('bearer-refresh：先 POST 换 token，再按路径取', () => {
    const script = scriptOf({
      ...BASE,
      auth: {
        source: {
          kind: 'endpoint',
          url: '/api/user/auth/refresh',
          method: 'POST',
          body: {},
          path: 'data.access_token',
        },
        place: { in: 'header', name: 'authorization', prefix: 'Bearer ' },
      },
    });
    expect(script).toContain('fetch("https://x.example.com/api/user/auth/refresh"');
    expect(script).toContain('const token = pick(preJson, "data.access_token");');
    expect(script).toContain('headers["authorization"] = "Bearer " + token;');
    expect(script).toContain('if (pre.status === 401 || pre.status === 403)');
  });

  it('CSRF 从 meta 取，放到头里', () => {
    const script = scriptOf({
      ...BASE,
      auth: { source: { kind: 'meta', name: 'csrf-token' }, place: { in: 'header', name: 'X-CSRF-Token' } },
    });
    expect(script).toContain('document.querySelector("meta[name=\\"csrf-token\\"]")');
    expect(script).toContain('headers["X-CSRF-Token"] = "" + token;');
  });

  it('CSRF 从 cookie 取，先 decodeURIComponent', () => {
    const script = scriptOf({
      ...BASE,
      auth: { source: { kind: 'cookieValue', name: 'XSRF-TOKEN' }, place: { in: 'header', name: 'X-XSRF-TOKEN' } },
    });
    expect(script).toContain('document.cookie.split("; ")');
    expect(script).toContain('decodeURIComponent(hit.slice(name.length + 1))');
  });

  it('页面全局变量与 storage 两种来源', () => {
    const global = scriptOf({
      ...BASE,
      auth: { source: { kind: 'global', path: '__INITIAL_STATE__.token' }, place: { in: 'header', name: 'authorization', prefix: 'Bearer ' } },
    });
    expect(global).toContain('const token = pick(globalThis, "__INITIAL_STATE__.token");');

    const storage = scriptOf({
      ...BASE,
      auth: {
        source: { kind: 'storage', area: 'session', key: 'token', path: 'access_token' },
        place: { in: 'header', name: 'authorization', prefix: 'Bearer ' },
      },
    });
    expect(storage).toContain('sessionStorage.getItem("token")');
    expect(storage).toContain('const token = pick(parsed, "access_token");');
  });

  it('token 放 query / body 的两种 place', () => {
    const query = scriptOf({
      ...BASE,
      auth: { source: { kind: 'cookieValue', name: 'sid' }, place: { in: 'query', name: 'token' } },
    });
    expect(query).toContain('url += (url.indexOf("?") === -1 ? "?" : "&") + "token="');
    expect(query).toContain('encodeURIComponent(token)');

    const body = scriptOf({
      ...BASE,
      request: { method: 'POST', path: '/api/do', body: { a: 1 } },
      auth: { source: { kind: 'cookieValue', name: 'sid' }, place: { in: 'body', field: 'meta.token' } },
    });
    expect(body).toContain('set(body, "meta.token", token);');
  });

  it('form 请求体编成 URLSearchParams，并补 content-type', () => {
    const script = scriptOf({
      ...BASE,
      request: { method: 'POST', path: '/api/issues', contentType: 'form', body: { title: 'a' } },
      auth: { source: { kind: 'meta', name: 'csrf' }, place: { in: 'body', field: 'csrf' } },
    });
    expect(script).toContain('new URLSearchParams({"title":"a"})');
    expect(script).toContain('body.set("csrf", token);');
    expect(script).toContain('"content-type":"application/x-www-form-urlencoded"');
  });

  it('response: text 直接回文本；json 带 path 时取那一格', () => {
    const text = scriptOf({ ...BASE, response: { kind: 'text' } });
    expect(text).toContain('return { ok: true, text };');

    const json = scriptOf({ ...BASE, response: { kind: 'json', path: 'data.list' } });
    expect(json).toContain('const value = pick(data, "data.list");');
    expect(json).toContain('if (value === undefined)');
  });

  it('overrides 合并 query 与 body，不污染配方', () => {
    const recipe: RequestRecipe = {
      ...BASE,
      request: { method: 'POST', path: '/api/do', query: { a: '1' }, body: { x: 1 } },
    };
    const script = scriptOf(recipe, { query: { b: '2' }, body: { x: 2 } });
    expect(script).toContain('?a=1&b=2');
    expect(script).toContain('let body = {"x":2};');
    expect(recipe.request.body).toEqual({ x: 1 });
  });

  it('JSON 请求体在页面里 stringify，不把对象直接交给 fetch', () => {
    const script = scriptOf({ ...BASE, request: { method: 'POST', path: '/api/do', body: { a: 1 } } });
    expect(script).toContain('let body = {"a":1};');
    expect(script).toContain('if (typeof body !== "string") body = JSON.stringify(body);');
  });

  it('换登录态那一次请求的 body 也 stringify', () => {
    const script = scriptOf({
      ...BASE,
      auth: {
        source: { kind: 'endpoint', url: '/r', method: 'POST', body: { a: 1 }, path: 't' },
        place: { in: 'header', name: 'x-token' },
      },
    });
    expect(script).toContain('body: JSON.stringify({"a":1})');
  });

  it('返回值里不带凭据', () => {
    const script = scriptOf({
      ...BASE,
      auth: { source: { kind: 'global', path: 'token' }, place: { in: 'header', name: 'authorization' } },
    });
    expect(script).not.toContain('return { ok: true, token');
    expect(script).toContain('return { ok: true, data };');
  });
});

describe('describeRecipe', () => {
  it('回 method / url / body / 凭据位置，不回 token', () => {
    const described = describeRecipe(
      {
        ...BASE,
        request: { method: 'GET', path: '/api/balance', query: { limit: 5 } },
        auth: { source: { kind: 'cookieValue', name: 'sid' }, place: { in: 'header', name: 'authorization', prefix: 'Bearer ' } },
      },
      { query: { limit: 10 } },
    );
    expect(described).toEqual({
      method: 'GET',
      url: 'https://x.example.com/api/balance?limit=10',
      auth: { source: 'cookieValue', place: 'header', name: 'authorization' },
    });
  });

  it('没有 auth 时不出 auth 字段；body 原样回', () => {
    const described = describeRecipe({ ...BASE, request: { method: 'POST', path: '/api/do', body: { a: 1 } } });
    expect(described.body).toEqual({ a: 1 });
    expect(described.auth).toEqual({ source: 'cookie', place: 'cookie' });
  });
});

describe('recipeProblemOf · 校验', () => {
  const bad = (recipe: unknown): string | undefined => recipeProblemOf(recipe);

  it('origin 只收裸 origin', () => {
    expect(bad({ ...BASE, origin: 'https://x.example.com/' })).toContain('origin');
    expect(bad({ ...BASE, origin: 'ftp://x.example.com' })).toContain('http');
    expect(bad({ ...BASE, origin: '' })).toContain('origin');
  });

  it('path 不许带查询 / 反斜杠 / 协议相对；绝对地址要同源', () => {
    expect(bad({ ...BASE, request: { method: 'GET', path: '/a?b=1' } })).toContain('查询');
    expect(bad({ ...BASE, request: { method: 'GET', path: '/a\\b' } })).toContain('反斜杠');
    expect(bad({ ...BASE, request: { method: 'GET', path: '//evil.test/a' } })).toContain('协议相对');
    expect(bad({ ...BASE, request: { method: 'GET', path: 'https://evil.test/a' } })).toContain('同源');
    expect(bad({ ...BASE, request: { method: 'GET', path: 'https://x.example.com/a' } })).toBeUndefined();
  });

  it('method / contentType / response.kind 只认枚举', () => {
    expect(bad({ ...BASE, request: { method: 'HEAD', path: '/a' } })).toContain('request.method');
    expect(bad({ ...BASE, request: { method: 'GET', path: '/a', contentType: 'xml' } })).toContain('contentType');
    expect(bad({ ...BASE, response: { kind: 'xml' } })).toContain('response.kind');
  });

  it('凭据头写死 → 红（request.headers 与 overrides 都拦）', () => {
    expect(bad({ ...BASE, request: { method: 'GET', path: '/a', headers: { Authorization: 'Bearer x' } } })).toContain('auth.place');
    expect(() => scriptOf(BASE, { headers: { cookie: 'a=b' } })).toThrow('auth.place');
  });

  it('GET 不带 body；form body 只要字符串', () => {
    expect(bad({ ...BASE, request: { method: 'GET', path: '/a', body: { x: 1 } } })).toContain('GET');
    expect(bad({ ...BASE, request: { method: 'POST', path: '/a', contentType: 'form', body: { x: 1 } } })).toContain('字符串');
  });

  it('auth 的 source / place 成对，且 cookie 来源不能放 header', () => {
    expect(bad({ ...BASE, auth: { source: { kind: 'cookie' } } })).toContain('auth.place');
    expect(
      bad({ ...BASE, auth: { source: { kind: 'cookie' }, place: { in: 'header', name: 'authorization' } } }),
    ).toContain('place.in 要写 cookie');
    expect(
      bad({ ...BASE, auth: { kind: 'none', source: { kind: 'cookie' }, place: { in: 'cookie' } } }),
    ).toContain('source / place');
  });

  it('source 的必填格与枚举', () => {
    expect(bad({ ...BASE, auth: { source: { kind: 'meta' }, place: { in: 'header', name: 'x' } } })).toContain('name');
    expect(bad({ ...BASE, auth: { source: { kind: 'storage', area: 'memory', key: 'k' }, place: { in: 'header', name: 'x' } } })).toContain('area');
    expect(bad({ ...BASE, auth: { source: { kind: 'endpoint', url: '/r', path: '' }, place: { in: 'header', name: 'x' } } })).toContain('path');
    expect(bad({ ...BASE, auth: { source: { kind: 'nope' }, place: { in: 'header', name: 'x' } } })).toContain('kind');
  });

  it('endpoint.url 可以相对，也可以绝对；loginUrl 只收 http(s)', () => {
    expect(
      bad({ ...BASE, auth: { source: { kind: 'endpoint', url: '/r', path: 't' }, place: { in: 'header', name: 'x' } } }),
    ).toBeUndefined();
    expect(
      bad({ ...BASE, auth: { source: { kind: 'endpoint', url: 'https://sso.example.com/r', path: 't' }, place: { in: 'header', name: 'x' } } }),
    ).toBeUndefined();
    expect(bad({ ...BASE, loginUrl: 'javascript:alert(1)' })).toContain('loginUrl');
  });

  it('maxBytes 是正整数且有上限', () => {
    expect(bad({ ...BASE, response: { kind: 'json', maxBytes: 0 } })).toContain('maxBytes');
    expect(bad({ ...BASE, response: { kind: 'json', maxBytes: 9 * 1024 * 1024 } })).toContain('maxBytes');
  });

  it('参数里的引号与反斜杠被 JSON.stringify 转义，不能改脚本结构', () => {
    const script = scriptOf({
      ...BASE,
      request: { method: 'GET', path: '/api/do', headers: { 'x-note': 'a"b\\c' } },
    });
    expect(script).toContain('"x-note":"a\\"b\\\\c"');
  });
});

describe('scriptOfMany · 批量读', () => {
  it('一次换 token、N 条并发，各自取自己那一格', () => {
    const script = scriptOfMany(
      {
        ...BASE,
        auth: {
          source: { kind: 'endpoint', url: '/api/user/auth/refresh', method: 'POST', body: {}, path: 'data.access_token' },
          place: { in: 'header', name: 'authorization', prefix: 'Bearer ' },
        },
        request: { method: 'GET', path: '/api/subscription/self', query: { lang: 'zh' } },
        response: { kind: 'json', path: 'data' },
      },
      {
        wallet: { path: '/api/wallet/balance', response: { path: 'data.balance' } },
        usage: { query: { days: 7 }, headers: { 'x-trace': '1' } },
      },
    );
    expect(script).toContain('fetch("https://x.example.com/api/user/auth/refresh"');
    expect(script).toContain('headers["authorization"] = "Bearer " + token;');
    expect(script).toContain('one(withToken("https://x.example.com/api/wallet/balance?lang=zh"), headers, "json", "data.balance"');
    expect(script).toContain('one(withToken("https://x.example.com/api/subscription/self?lang=zh&days=7"), Object.assign({}, headers, {"x-trace":"1"}), "json", "data"');
    expect(script).toContain('await Promise.all([');
    expect(script).toContain('return { ok: true, results };');
    expect(script).not.toContain('auth.access_token');
  });

  it('没有 token 的批量读不带 withToken 前缀', () => {
    const script = scriptOfMany(
      { ...BASE, auth: { kind: 'none' } },
      { a: { path: '/a' }, b: { path: '/b' } },
    );
    expect(script).toContain('const withToken = (url) => url;');
    expect(script).not.toContain('const token');
  });

  it('token 放 query 时逐条拼上去', () => {
    const script = scriptOfMany(
      {
        ...BASE,
        auth: { source: { kind: 'global', path: 'state.token' }, place: { in: 'query', name: 'access_token' } },
      },
      { a: { path: '/a' } },
    );
    expect(script).toContain('const withToken = (url) => url + (url.indexOf("?") === -1 ? "?" : "&")');
    expect(script).toContain('"access_token=" + encodeURIComponent(token)');
  });

  it('批量只认 GET，也不带 body 里的凭据', () => {
    expect(() =>
      scriptOfMany({ ...BASE, request: { method: 'POST', path: '/a' } }, { a: {} }),
    ).toThrow('GET');
    expect(() =>
      scriptOfMany(
        { ...BASE, auth: { source: { kind: 'global', path: 't' }, place: { in: 'body', field: 'token' } } },
        { a: {} },
      ),
    ).toThrow('body');
  });
});

describe('callsProblemOf · 批量校验', () => {
  it('calls 要是对象、非空、不超过上限', () => {
    expect(callsProblemOf(BASE, undefined)).toContain('对象');
    expect(callsProblemOf(BASE, {})).toContain('不能为空');
    const many: Record<string, CallOverrides> = {};
    for (let index = 0; index < MAX_RECIPE_CALLS + 1; index += 1) many[`c${index}`] = {};
    expect(callsProblemOf(BASE, many)).toContain('最多');
  });

  it('每格按 overrides 校验，并带上是哪一条', () => {
    expect(callsProblemOf(BASE, { a: null })).toContain('calls.a');
    expect(callsProblemOf(BASE, { a: { path: '/a?b=1' } })).toContain('查询');
    expect(callsProblemOf(BASE, { a: { path: 'https://evil.test/a' } })).toContain('同源');
    expect(callsProblemOf(BASE, { a: { headers: { 'x-api-key': 'k' } } })).toContain('calls.a');
    expect(callsProblemOf(BASE, { a: { response: { kind: 'xml' } } })).toContain('calls.a');
    expect(callsProblemOf(BASE, { a: { path: '/a' } })).toBeUndefined();
  });
});
