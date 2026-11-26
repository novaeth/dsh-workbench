import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshHostContext, DshRequest, DshResponse, DshWebRoute } from '@dsh-workbench/shared/host';
import { FEATURED_ROUTE, FEATURED_SERVICE, FEATURED_SOURCE, FEATURED_SOURCE_ID, integrateFeaturedPlugins, normalizeEntry, normalizeSource } from '../featured';

function fakeRes() {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    setHeader: (name: string, value: string) => {
      state.headers[name] = value;
    },
    end: (body?: string) => {
      state.body = body ?? '';
    },
  } as unknown as DshResponse;
  return { res, state };
}

interface CtxOptions {
  readonly manager?: unknown;
  readonly registry?: unknown;
  readonly failRegister?: boolean;
}

function fakeCtx(options: CtxOptions = {}) {
  const registered: DshWebRoute[] = [];
  const warnings: string[] = [];
  const provided: string[] = [];
  const state = { warnings, provided };
  const ctx = {
    get: (key: string) => {
      if (key === FEATURED_SERVICE) return options.registry;
      if (key === 'pluginManager') return options.manager;
      return undefined;
    },
    provide: (key: string) => {
      state.provided.push(key);
      return () => undefined;
    },
    effect: (fn: () => unknown) => fn(),
    logger: {
      info: () => undefined,
      warn: (message: string) => {
        state.warnings.push(message);
      },
    },
    webServer: {
      register: (route: DshWebRoute) => {
        if (options.failRegister === true) throw new Error('route already registered');
        registered.push(route);
        return () => undefined;
      },
    },
  } as unknown as DshHostContext;
  return { ctx, registered, warnings, provided };
}

async function callRoute(
  registered: DshWebRoute[],
  request: { method?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  expect(registered).toHaveLength(1);
  const { res, state } = fakeRes();
  await registered[0].handler({ headers: { host: '127.0.0.1:50729', ...request.headers }, method: request.method ?? 'GET' } as DshRequest, res);
  return { status: state.statusCode, body: JSON.parse(state.body) as Record<string, unknown> };
}

function stubFetch(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({ ok: status === 200, status, json: async () => payload }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeEntry', () => {
  it('保留必填字段并补全来源', () => {
    expect(normalizeEntry({ package: 'dsh-a', title: ' A ' }, 'skillpie')).toEqual({ package: 'dsh-a', title: 'A', source: 'skillpie' });
  });

  it('name 可作 package 的兜底', () => {
    expect(normalizeEntry({ name: 'dsh-b', title: 'B' }, 's')?.package).toBe('dsh-b');
  });

  it('缺 package 或 title 时拒绝', () => {
    expect(normalizeEntry({ title: 'B' }, 's')).toBeUndefined();
    expect(normalizeEntry({ package: 'dsh-b' }, 's')).toBeUndefined();
    expect(normalizeEntry('junk', 's')).toBeUndefined();
  });

  it('富字段原样保留且列表截断去重', () => {
    const entry = normalizeEntry(
      { package: 'dsh-c', title: 'C', description: 'd', version: '1.0.0', stars: 3, downloads: 0, screenshots: ['a', 'a', 'b', 'c', 'd'], tags: ['x', '', 'x', 'y'] },
      's',
    );
    expect(entry?.screenshots).toEqual(['a', 'b', 'c', 'd']);
    expect(entry?.tags).toEqual(['x', 'y']);
    expect(entry?.stars).toBe(3);
    expect(entry?.downloads).toBe(0);
  });

  it('负数与非法数值被丢弃', () => {
    expect(normalizeEntry({ package: 'dsh-d', title: 'D', stars: -1 }, 's')?.stars).toBeUndefined();
  });
});

describe('normalizeSource', () => {
  it('id 必填且条目逐个规范化', () => {
    const source = normalizeSource({ id: 'src', entries: [{ package: 'dsh-a', title: 'A' }, { title: 'bad' }] });
    expect(source?.entries).toHaveLength(1);
    expect(normalizeSource({ title: 'no id' })).toBeUndefined();
  });
});

describe('integrateFeaturedPlugins', () => {
  it('登记目录、提供注册表并挂 exact 聚合路由', async () => {
    const { ctx, registered, provided } = fakeCtx();
    integrateFeaturedPlugins(ctx);
    expect(provided).toEqual([FEATURED_SERVICE]);
    expect(registered).toHaveLength(1);
    expect(registered[0].kind).toBe('exact');
    expect(registered[0].path).toBe(FEATURED_ROUTE);
    const { body } = await callRoute(registered);
    expect(body.ok).toBe(true);
    const data = body.data as { entries: unknown[]; installed: Record<string, string>; remote: boolean; sources: Array<Record<string, unknown>> };
    expect(data.entries).toEqual([]);
    expect(data.installed).toEqual({});
    expect(data.remote).toBe(false);
    expect(data.sources).toEqual([{ id: FEATURED_SOURCE_ID, title: FEATURED_SOURCE.title, entries: 0 }]);
  });

  it('聚合远程目录、回填富字段并补充登记源条目', async () => {
    const localSource = { id: 'local', title: 'local', entries: [{ package: 'dsh-extra', title: 'extra', source: 'local', homepage: 'https://h' }] };
    const manager = {
      listBundles: async () => [{ name: 'dsh-featured', installed: true, version: '1.2.3' }],
      listPlugins: async () => [{ name: 'dsh-other', version: '2.0.0' }],
    };
    const { ctx, registered } = fakeCtx({ manager });
    integrateFeaturedPlugins(ctx, localSource);
    stubFetch({ updated: '2026-01-01', entries: [{ package: 'dsh-local', title: 'remote title', stars: 5 }, { package: 'dsh-remote', title: 'remote' }] });
    const { body } = await callRoute(registered);
    const data = body.data as { entries: Array<Record<string, unknown>>; installed: Record<string, string>; remote: boolean };
    expect(data.remote).toBe(true);
    expect(data.installed).toEqual({ 'dsh-featured': '1.2.3', 'dsh-other': '2.0.0' });
    expect(data.entries.map((entry) => entry.package)).toEqual(['dsh-local', 'dsh-remote', 'dsh-extra']);
    const local = data.entries[0];
    expect(local.title).toBe('remote title');
    expect(local.stars).toBe(5);
    const extra = data.entries[2];
    expect(extra.title).toBe('extra');
    expect(extra.homepage).toBe('https://h');
  });

  it('同一来源目录在 TTL 内只取一次', async () => {
    const { ctx, registered } = fakeCtx();
    integrateFeaturedPlugins(ctx);
    const fetchMock = stubFetch({ updated: '2026-01-01', entries: [] });
    await callRoute(registered);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await callRoute(registered);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    await callRoute(registered);
    nowSpy.mockRestore();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('远程目录全部失败时聚合仍可用', async () => {
    const { ctx, registered } = fakeCtx();
    integrateFeaturedPlugins(ctx);
    stubFetch({ message: 'nope' }, 503);
    const { body } = await callRoute(registered);
    expect(body.ok).toBe(true);
    expect((body.data as { remote: boolean }).remote).toBe(false);
  });

  it('跨源请求被拒绝', async () => {
    const { ctx, registered } = fakeCtx();
    integrateFeaturedPlugins(ctx);
    const { status, body } = await callRoute(registered, { headers: { origin: 'https://evil.example' } });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
  });

  it('同源请求放行', async () => {
    const { ctx, registered } = fakeCtx();
    integrateFeaturedPlugins(ctx);
    const { status } = await callRoute(registered, { headers: { origin: 'http://127.0.0.1:50729' } });
    expect(status).toBe(200);
  });

  it('非 GET 请求返回 405', async () => {
    const { ctx, registered } = fakeCtx();
    integrateFeaturedPlugins(ctx);
    const { status, body } = await callRoute(registered, { method: 'POST' });
    expect(status).toBe(405);
    expect(body.ok).toBe(false);
  });

  it('聚合抛错时降级为 ok:false', async () => {
    const manager = { listBundles: async () => { throw new Error('manager down'); } };
    const { ctx, registered, warnings } = fakeCtx({ manager });
    integrateFeaturedPlugins(ctx);
    stubFetch({ entries: [] });
    const { body } = await callRoute(registered);
    expect(body.ok).toBe(false);
    expect(warnings.some((message) => message.includes('manager down'))).toBe(true);
  });

  it('已有注册表时让位不再提供', () => {
    const registry = { register: () => () => undefined, list: () => [] };
    const { ctx, registered, provided } = fakeCtx({ registry });
    integrateFeaturedPlugins(ctx);
    expect(provided).toEqual([]);
    expect(registered).toEqual([]);
  });

  it('路由已被占用时告警不抛错', () => {
    const { ctx, registered, warnings } = fakeCtx({ failRegister: true });
    expect(() => integrateFeaturedPlugins(ctx)).not.toThrow();
    expect(registered).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('注册表提供失败时退化为纯登记方', () => {
    const warnings: string[] = [];
    const ctx = {
      get: () => {
        throw new Error('registry read failed');
      },
      provide: () => {
        throw new Error('provide failed');
      },
      effect: () => {
        throw new Error('effect failed');
      },
      logger: { info: () => undefined, warn: (message: string) => warnings.push(message) },
      webServer: { register: () => () => undefined },
    } as unknown as DshHostContext;
    expect(() => integrateFeaturedPlugins(ctx)).not.toThrow();
    expect(warnings).toHaveLength(3);
  });
});
