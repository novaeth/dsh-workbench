import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { RequestRecipe } from '@dsh-workbench/shared/host';
import { createDataReader } from '../index.js';

const RECIPE: RequestRecipe = {
  origin: 'https://x.example.com',
  request: { method: 'GET', path: '/api/balance' },
  response: { kind: 'json', path: 'data' },
};

function readerOf(plan: Parameters<typeof createFakeShell>[0]) {
  const fake = createFakeShell(plan);
  return { reader: createDataReader({ shell: fake.shell, channel: false }), fake };
}

describe('DataReader.request · 配方读', () => {
  it('GET 配方 → 走读会话 eval，页面信封解包成 data', async () => {
    const { reader, fake } = readerOf([{ stdout: JSON.stringify({ ok: true, data: { balance: 3 } }) }]);
    const result = await reader.request(RECIPE);

    expect(result).toEqual({ ok: true, data: { balance: 3 } });
    expect(fake.commands()[0]).toContain("'browser' 'workbench-read' 'eval'");
    expect(fake.commands()[0]).toContain('OPENCLI_WINDOW=background');
  });

  it('text 响应 → 解包成字符串', async () => {
    const { reader } = readerOf([{ stdout: JSON.stringify({ ok: true, text: '<rss />' }) }]);
    const result = await reader.request({ ...RECIPE, response: { kind: 'text' } });
    expect(result).toEqual({ ok: true, data: '<rss />' });
  });

  it('request 只读 GET；POST 当场拒，且一条命令都不发', async () => {
    const { reader, fake } = readerOf([{ stdout: '{}' }]);
    const result = await reader.request({ ...RECIPE, request: { method: 'POST', path: '/api/do' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-request');
    expect(fake.commands()).toEqual([]);
  });

  it('submit 允许 POST', async () => {
    const { reader, fake } = readerOf([{ stdout: JSON.stringify({ ok: true, data: { id: 9 } }) }]);
    const result = await reader.submit(
      { ...RECIPE, request: { method: 'POST', path: '/api/do', body: { a: 1 } } },
      { body: { a: 2 } },
    );
    expect(result).toEqual({ ok: true, data: { id: 9 } });
    expect(fake.commands()[0]).toContain('"a":2');
  });

  it('配方不合法 → invalid-request，不发命令', async () => {
    const { reader, fake } = readerOf([{ stdout: '{}' }]);
    const result = await reader.request({
      ...RECIPE,
      request: { method: 'GET', path: '/api/do', headers: { authorization: 'Bearer x' } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-request');
    expect(fake.commands()).toEqual([]);
  });

  it('页面回 not-logged-in → auth + pageCode + helpUrl(loginUrl)', async () => {
    const { reader } = readerOf([{ stdout: JSON.stringify({ ok: false, code: 'not-logged-in' }) }]);
    const result = await reader.request({ ...RECIPE, loginUrl: 'https://x.example.com/login' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth');
      expect(result.error.pageCode).toBe('not-logged-in');
      expect(result.error.helpUrl).toBe('https://x.example.com/login');
    }
  });

  it('平台码 AUTH_UNAUTHORIZED → auth（不落到 browser）', async () => {
    const { reader } = readerOf([
      { stdout: JSON.stringify({ ok: false, code: 'AUTH_UNAUTHORIZED', message: '登录已过期' }) },
    ]);
    const result = await reader.request({ ...RECIPE, loginUrl: 'https://x.example.com/login' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth');
      expect(result.error.pageCode).toBe('AUTH_UNAUTHORIZED');
    }
  });

  it('页面回 http-500 → http + status', async () => {
    const { reader } = readerOf([{ stdout: JSON.stringify({ ok: false, code: 'http-500', message: '炸了' }) }]);
    const result = await reader.request(RECIPE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('http');
      expect(result.error.status).toBe(500);
    }
  });

  it('页面回 shape → parse', async () => {
    const { reader } = readerOf([{ stdout: JSON.stringify({ ok: false, code: 'shape' }) }]);
    const result = await reader.request(RECIPE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('parse');
  });

  it('不在站点 → 后台 open 一次再读', async () => {
    const { reader, fake } = readerOf([
      { stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) },
      {},
      { stdout: JSON.stringify({ ok: true, data: { n: 1 } }) },
    ]);
    const result = await reader.request(RECIPE);

    expect(result).toEqual({ ok: true, data: { n: 1 } });
    expect(fake.commands()[0]).toContain("'eval'");
    expect(fake.commands()[1]).toContain("'open' 'https://x.example.com'");
    expect(fake.commands()[2]).toContain("'eval'");
  });

  it('页面没回 data / text → parse（不把整页当数据）', async () => {
    const { reader } = readerOf([{ stdout: JSON.stringify({ ok: true, other: 1 }) }]);
    const result = await reader.request(RECIPE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('parse');
  });
});

describe('DataReader.requestMany · 批量读', () => {
  const BATCH = {
    ...RECIPE,
    auth: {
      source: { kind: 'endpoint' as const, url: '/api/user/auth/refresh', method: 'POST' as const, body: {}, path: 'data.access_token' },
      place: { in: 'header' as const, name: 'authorization', prefix: 'Bearer ' },
    },
  };

  it('一次 eval，多条结果各自解包', async () => {
    const { reader, fake } = readerOf([
      {
        stdout: JSON.stringify({
          ok: true,
          results: { balance: { ok: true, data: { n: 3 } }, feed: { ok: true, text: '<rss />' } },
        }),
      },
    ]);
    const results = await reader.requestMany(BATCH, {
      balance: { path: '/api/balance', response: { path: 'data' } },
      feed: { path: '/rss', response: { kind: 'text' } },
    });

    expect(results['balance']).toEqual({ ok: true, data: { n: 3 } });
    expect(results['feed']).toEqual({ ok: true, data: '<rss />' });
    expect(fake.commands()).toHaveLength(1);
    expect(fake.commands()[0]).toContain("'browser' 'workbench-read' 'eval'");
  });

  it('一条失败不丢其余：逐格映射页面码', async () => {
    const { reader } = readerOf([
      {
        stdout: JSON.stringify({
          ok: true,
          results: {
            balance: { ok: false, code: 'http-404', message: '没有这个接口' },
            feed: { ok: true, data: 1 },
          },
        }),
      },
    ]);
    const results = await reader.requestMany(BATCH, { balance: {}, feed: {} });

    expect(results['feed']).toEqual({ ok: true, data: 1 });
    const failed = results['balance'];
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.code).toBe('http');
      expect(failed.error.status).toBe(404);
      expect(failed.error.pageCode).toBe('http-404');
    }
  });

  it('换登录态失败 → 每一格都是 auth，带 helpUrl', async () => {
    const { reader } = readerOf([{ stdout: JSON.stringify({ ok: false, code: 'not-logged-in' }) }]);
    const results = await reader.requestMany({ ...BATCH, loginUrl: 'https://x.example.com/login' }, { a: {}, b: {} });

    for (const name of ['a', 'b']) {
      const one = results[name];
      expect(one.ok).toBe(false);
      if (!one.ok) {
        expect(one.error.code).toBe('auth');
        expect(one.error.helpUrl).toBe('https://x.example.com/login');
      }
    }
  });

  it('批量只读 GET；calls 不合法都不发命令', async () => {
    const { reader, fake } = readerOf([{ stdout: '{}' }]);
    const write = await reader.requestMany({ ...BATCH, request: { method: 'POST', path: '/api/do' } }, { a: {} });
    const bad = await reader.requestMany(BATCH, {});
    const one = write['a'];
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.error.code).toBe('invalid-request');
    expect(bad).toEqual({});
    expect(fake.commands()).toEqual([]);
  });

  it('页面没回 results → 每格 parse', async () => {
    const { reader } = readerOf([{ stdout: JSON.stringify({ ok: true, data: 1 }) }]);
    const results = await reader.requestMany(BATCH, { a: {} });
    const one = results['a'];
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.error.code).toBe('parse');
  });
});
