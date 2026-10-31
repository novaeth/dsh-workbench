import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiProblemOf, headersOf, jarOf, perform, placeOf, urlOf } from '../core.js';

function stubFetch(reply) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push({ url: String(url), init });
    const one = typeof reply === 'function' ? reply({ url: String(url), init }) : reply;
    return {
      ok: one.status === undefined ? true : one.status < 400,
      status: one.status ?? 200,
      text: async () => one.text ?? '{"ok":1}',
    };
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('通道参数校验', () => {
  it('--api 不认识就拒，且报出它要哪一版', () => {
    expect(apiProblemOf('1')).toBeUndefined();
    expect(apiProblemOf(1)).toBeUndefined();
    expect(apiProblemOf('2')).toContain('--api 1');
    expect(apiProblemOf(undefined)).toContain('--api 1');
  });

  it('--headers 只收对象；凭据头一律拒（与 design check 同一张表）', () => {
    expect(headersOf('{"x-trace":"1"}')).toEqual({ 'x-trace': '1' });
    expect(() => headersOf('nope')).toThrow('JSON');
    expect(() => headersOf('[]')).toThrow('对象');
    expect(() => headersOf('{"Authorization":"Bearer x"}')).toThrow('凭据头');
    expect(() => headersOf('{"cookie":"a=b"}')).toThrow('凭据头');
    expect(() => headersOf('{"X-CSRF-Token":"t"}')).toThrow('凭据头');
    expect(() => headersOf('{"x-api-key":"k"}')).toThrow('凭据头');
  });

  it('--url 只认绝对 http(s)', () => {
    expect(urlOf('https://x.example.com/a').hostname).toBe('x.example.com');
    expect(() => urlOf('/a')).toThrow('合法地址');
    expect(() => urlOf('javascript:alert(1)')).toThrow('http');
    expect(() => urlOf('')).toThrow('不能为空');
  });

  it('--place 三种形状，别的当场拒', () => {
    expect(placeOf('header:authorization')).toEqual({ where: 'header', name: 'authorization' });
    expect(placeOf('query:access_token')).toEqual({ where: 'query', name: 'access_token' });
    expect(placeOf('body:token')).toEqual({ where: 'body', name: 'token' });
    expect(placeOf('')).toBeUndefined();
    expect(() => placeOf('cookie')).toThrow('--place 要是');
    expect(() => placeOf('header:')).toThrow('不能为空');
    expect(() => placeOf('path:x')).toThrow('只认 header / query / body');
    expect(() => placeOf('body:a.b')).toThrow('顶层');
  });
});

describe('jar 只问目标域与父域', () => {
  it('子域先问自己，再问父域', async () => {
    const page = { asked: [], async getCookies(options) { this.asked.push(options.domain); return []; } };
    await jarOf(page, new URL('https://team.coding.net/api/x'));
    expect(page.asked).toEqual(['team.coding.net', 'coding.net']);
  });

  it('两段式域名没有父域可问，只问自己', async () => {
    const page = { asked: [], async getCookies(options) { this.asked.push(options.domain); return []; } };
    await jarOf(page, new URL('https://coding.net/api/x'));
    expect(page.asked).toEqual(['coding.net']);
  });

  it('按名字去重，先问到的优先', async () => {
    const page = {
      async getCookies({ domain }) {
        return domain === 'team.coding.net'
          ? [{ name: 'sid', value: 'child' }]
          : [
              { name: 'sid', value: 'parent' },
              { name: 'xsrf', value: 'p' },
            ];
      },
    };
    const jar = await jarOf(page, new URL('https://team.coding.net/api/x'));
    expect(jar.get('sid')).toBe('child');
    expect(jar.get('xsrf')).toBe('p');
  });
});

describe('perform · cookie 来源', () => {
  it('把 jar 拼成 Cookie 头，不带任何额外凭据', async () => {
    const calls = stubFetch({ text: '{"v":1}' });
    const page = { getCookies: async () => [{ name: 'sid', value: 's1' }] };
    const result = await perform(page, { api: 1, url: 'https://x.example.com/a' }, 'GET');

    expect(result).toEqual({ ok: true, data: { v: 1 } });
    expect(calls[0].url).toBe('https://x.example.com/a');
    expect(calls[0].init.headers['cookie']).toBe('sid=s1');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('--jar none 不带 cookie', async () => {
    const calls = stubFetch({ text: '{}' });
    await perform({ getCookies: async () => [{ name: 'sid', value: 's1' }] }, { api: 1, url: 'https://x.example.com/a', jar: 'none' }, 'GET');
    expect(calls[0].init.headers['cookie']).toBeUndefined();
  });

  it('jar 问不出来 → 抛（让宿主回落），不是 auth', async () => {
    const page = {
      async getCookies() {
        throw new Error('浏览器桥还没就绪');
      },
    };
    await expect(perform(page, { api: 1, url: 'https://x.example.com/a' }, 'GET')).rejects.toThrow('浏览器桥');
  });
});

describe('perform · cookieValue 来源', () => {
  const page = { getCookies: async () => [{ name: 'XSRF-TOKEN', value: 'tk' }] };

  it('放头里，带前缀', async () => {
    const calls = stubFetch({ text: '{"v":1}' });
    await perform(
      page,
      { api: 1, url: 'https://x.example.com/a', cookie: 'XSRF-TOKEN', place: 'header:x-csrf-token' },
      'GET',
    );
    expect(calls[0].init.headers['x-csrf-token']).toBe('tk');
    expect(calls[0].init.headers['cookie']).toContain('XSRF-TOKEN=tk');
  });

  it('放 query，值要编码', async () => {
    const calls = stubFetch({ text: '{}' });
    await perform(page, { api: 1, url: 'https://x.example.com/a?q=1', cookie: 'XSRF-TOKEN', place: 'query:token' }, 'GET');
    expect(calls[0].url).toBe('https://x.example.com/a?q=1&token=tk');
  });

  it('放 body 顶层字段（json）', async () => {
    const calls = stubFetch({ text: '{}' });
    await perform(
      page,
      {
        api: 1,
        url: 'https://x.example.com/a',
        cookie: 'XSRF-TOKEN',
        place: 'body:csrf',
        body: '{"a":1}',
      },
      'POST',
    );
    expect(calls[0].init.body).toBe('{"a":1,"csrf":"tk"}');
    expect(calls[0].init.headers['content-type']).toBe('application/json');
  });

  it('放 body 顶层字段（form）', async () => {
    const calls = stubFetch({ text: '{}' });
    await perform(
      page,
      {
        api: 1,
        url: 'https://x.example.com/a',
        cookie: 'XSRF-TOKEN',
        place: 'body:csrf',
        body: 'a=1',
        contentType: 'form',
      },
      'POST',
    );
    expect(calls[0].init.body).toBe('a=1&csrf=tk');
    expect(calls[0].init.headers['content-type']).toBe('application/x-www-form-urlencoded');
  });

  it('jar 里没有那一格 → 抛（τ 未登录或名字不对）', async () => {
    await expect(
      perform({ getCookies: async () => [] }, { api: 1, url: 'https://x.example.com/a', cookie: 'nope', place: 'header:x' }, 'GET'),
    ).rejects.toThrow('没有 cookie');
  });

  it('给了 --cookie 没给 --place → 抛', async () => {
    await expect(perform(page, { api: 1, url: 'https://x.example.com/a', cookie: 'XSRF-TOKEN' }, 'GET')).rejects.toThrow(
      '--place',
    );
  });

  it('--jar none 配 --cookie → 抛', async () => {
    await expect(
      perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none', cookie: 'XSRF-TOKEN', place: 'header:x' }, 'GET'),
    ).rejects.toThrow('--jar cookie');
  });
});

describe('perform · 信封', () => {
  it('401 / 403 → not-logged-in', async () => {
    stubFetch({ status: 401, text: '{}' });
    const result = await perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none' }, 'GET');
    expect(result.code).toBe('not-logged-in');
  });

  it('其他非 2xx → http-<status>，并带截断正文', async () => {
    stubFetch({ status: 500, text: '炸了' });
    const result = await perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none' }, 'GET');
    expect(result).toEqual({ ok: false, code: 'http-500', message: '炸了' });
  });

  it('200 但不是 JSON → shape（和页面脚本同一句话）', async () => {
    stubFetch({ text: '<!doctype html>' });
    const result = await perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none' }, 'GET');
    expect(result.code).toBe('shape');
  });

  it('kind: text 原样回 text', async () => {
    stubFetch({ text: '<rss />' });
    const result = await perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none', kind: 'text' }, 'GET');
    expect(result).toEqual({ ok: true, text: '<rss />' });
  });

  it('超 maxBytes → too-large，不截断', async () => {
    stubFetch({ text: 'x'.repeat(64) });
    const result = await perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none', maxBytes: 8 }, 'GET');
    expect(result.code).toBe('too-large');
  });

  it('fetch 抛超时 → timeout', async () => {
    globalThis.fetch = vi.fn(async () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    });
    const result = await perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none' }, 'GET');
    expect(result.code).toBe('timeout');
  });

  it('网络错 → fetch-failed（不冒成 cli-exec-failed）', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await perform({}, { api: 1, url: 'https://x.example.com/a', jar: 'none' }, 'GET');
    expect(result).toEqual({ ok: false, code: 'fetch-failed', message: 'ECONNREFUSED' });
  });

  it('--api 不对不发请求', async () => {
    const calls = stubFetch({});
    await expect(perform({}, { api: 2, url: 'https://x.example.com/a' }, 'GET')).rejects.toThrow('--api 1');
    expect(calls).toEqual([]);
  });
});
