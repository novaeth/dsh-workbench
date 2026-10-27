import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PREFIX } from '../config/constants.js';
import { apiGet } from './workbench-client.js';

interface FetchRecord {
  url: string;
  method: string;
}

function stubFetch(reply: { status?: number; body: unknown }) {
  const records: FetchRecord[] = [];
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    records.push({ url, method: init?.method ?? 'GET' });
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      json: async () => reply.body,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { records, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiGet', () => {
  it('用 GET 打 API_PREFIX 下的路由，并带上 accept 头', async () => {
    const { records, fetchMock } = stubFetch({ body: { ok: true } });
    await apiGet('health');

    expect(records[0]?.url).toBe(`${API_PREFIX}/health`);
    expect(records[0]?.method).toBe('GET');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: { accept: 'application/json' },
    });
  });

  it('查询参数进 URL；undefined 的项不出现', async () => {
    const { records } = stubFetch({ body: { ok: true } });
    await apiGet('issues', { workspaceId: 'w1', status: 'all', refresh: undefined, n: 0 });

    const [pathname, query] = (records[0]?.url ?? '').split('?');
    const params = new URLSearchParams(query ?? '');
    expect(pathname).toBe(`${API_PREFIX}/issues`);
    expect(params.get('workspaceId')).toBe('w1');
    expect(params.get('status')).toBe('all');
    expect(params.get('n')).toBe('0');
    expect(params.has('refresh')).toBe(false);
  });

  it('没有参数时不带问号', async () => {
    const { records } = stubFetch({ body: { ok: true } });
    await apiGet('project');
    expect(records[0]?.url).toBe(`${API_PREFIX}/project`);
  });

  it('宿主的 {ok:true} 信封原样返回', async () => {
    stubFetch({ body: { ok: true, issues: [{ code: 1 }] } });
    const result = await apiGet<{ issues: Array<{ code: number }> }>('issues');
    expect(result.ok).toBe(true);
    expect(result.ok && result.issues[0]?.code).toBe(1);
  });

  it('宿主的 {ok:false} 信封原样返回，不抛异常', async () => {
    stubFetch({
      body: { ok: false, error: { code: 'demo-not-logged-in', message: '登录态失效' } },
    });
    const result = await apiGet('issues');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('demo-not-logged-in');
  });

  it('HTTP 非 2xx 也走结构化错误（不读 body）', async () => {
    stubFetch({ status: 500, body: {} });
    const result = await apiGet('issues');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatchObject({ code: 'http' });
    expect(result.ok === false && result.error.message).toContain('500');
  });
});

describe('apiGet 不带任何"刷新鲜度"的开关', () => {
  it('请求就是请求：没有 refresh 之类的旁路参数（宿主侧也没有缓存可绕）', async () => {
    const { records } = stubFetch({ body: { ok: true } });
    await apiGet('issues', { status: 'all' }, { signal: undefined });

    expect(records[0]?.url).not.toContain('refresh');
  });
});
