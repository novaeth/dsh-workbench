import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshResponse, DshWebRoute } from '@dsh-workbench/shared';
import { ACTIONS_PREFIX, API_PREFIX, PREFS_PREFIX } from '@dsh-workbench/shared/host';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';
import { changesHandler, flag, healthHandler, param, registerActions, registerApi, registerPrefs, registerProvision, type RouteTable } from '@dsh-workbench/shared/host';

function fakeRes() {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: '' };
  const res: DshResponse = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    setHeader: (name, value) => {
      state.headers[name] = value;
    },
    end: (body) => {
      state.body = body ?? '';
    },
  };
  return { res, state };
}

function fakeCtx() {
  const registered: DshWebRoute[] = [];
  const warnings: string[] = [];
  const ctx: DshHostContext = {
    get: <T,>() => ({ dir: '/Users/x/.dsh/profiles/workbench' }) as T,
    provide: () => () => {},
    effect: () => () => {},
    inject: () => () => {},
    logger: { info: () => {}, warn: (message) => warnings.push(message) },
    webServer: {
      register: (route) => {
        registered.push(route);
        return () => {};
      },
    },
  };
  return { ctx, registered, warnings };
}

async function call(
  routes: RouteTable,
  request: DshRequest,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { ctx, registered } = fakeCtx();
  registerApi(ctx, routes);
  const route = registered[0] as DshWebRoute;
  const { res, state } = fakeRes();
  await route.handler(request, res);
  return { status: state.statusCode, body: JSON.parse(state.body) as Record<string, unknown> };
}

describe('registerApi', () => {
  it('注册的是 API_PREFIX 前缀路由', () => {
    const { ctx, registered } = fakeCtx();
    registerApi(ctx, { health: () => ({ ok: true }) });
    expect(registered).toHaveLength(1);
    expect(registered[0]?.kind).toBe('prefix');
    expect(registered[0]?.path).toBe(API_PREFIX);
  });

  it('处理器的返回值包成 200 JSON', async () => {
    const result = await call({ health: () => ({ ok: true, n: 1 }) }, {
      method: 'GET',
      url: `${API_PREFIX}/health`,
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, n: 1 });
  });

  it('带 query 的路由把 searchParams 交给处理器（空值也保留 key）', async () => {
    let seen: URLSearchParams | undefined;
    await call(
      {
        issues: (search) => {
          seen = search;
          return { ok: true };
        },
      },
      { method: 'GET', url: `${API_PREFIX}/issues?workspaceId=w1&refresh=` },
    );
    expect(seen?.get('workspaceId')).toBe('w1');
    expect(seen?.get('refresh')).toBe('');
    expect(seen?.get('missing')).toBeNull();
  });

  it('未知路由 404，非 GET 405', async () => {
    const missing = await call({}, { method: 'GET', url: `${API_PREFIX}/nope` });
    expect(missing.status).toBe(404);
    expect((missing.body.error as { code: string }).code).toBe('not-found');

    const wrongMethod = await call({ health: () => ({ ok: true }) }, {
      method: 'POST',
      url: `${API_PREFIX}/health`,
    });
    expect(wrongMethod.status).toBe(405);
  });

  it('数据层错误走 200 + {ok:false}（"不是代码平台仓库"是状态，不是故障）', async () => {
    const result = await call(
      {
        issues: () => {
          throw new WorkbenchDataError('workbench/not-a-platform-repo', '这个目录不是代码平台仓库', {
            hint: '指向 e.demo.net',
            project: { kind: 'unsupported' },
          });
        },
      },
      { method: 'GET', url: `${API_PREFIX}/issues` },
    );
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toMatchObject({
      code: 'workbench/not-a-platform-repo',
      message: '这个目录不是代码平台仓库',
      hint: '指向 e.demo.net',
      project: { kind: 'unsupported' },
    });
  });

  it('意外异常走 500，并留下一条 warn', async () => {
    const { ctx, registered, warnings } = fakeCtx();
    registerApi(ctx, {
      issues: () => {
        throw new Error('boom');
      },
    });
    const route = registered[0] as DshWebRoute;
    const { res, state } = fakeRes();
    await route.handler({ method: 'GET', url: `${API_PREFIX}/issues` }, res);

    expect(state.statusCode).toBe(500);
    expect(JSON.parse(state.body)).toMatchObject({ ok: false, error: { code: 'internal' } });
    expect(warnings.join()).toContain('issues');
  });

  it('★ 模块带自己那份 shared 的 WorkbenchDataError（类不同）也要认：码与登录地址都带出去', async () => {
    const { ctx, registered } = fakeCtx();
    class ForeignDataError extends Error {
      readonly code = 'auth-required';
      readonly helpUrl = 'https://inventory.example.test/login';
      constructor() {
        super('Inventory 登录态失效了');
        this.name = 'WorkbenchDataError';
      }
    }
    registerApi(ctx, {
      issues: () => {
        throw new ForeignDataError();
      },
    });
    const route = registered[0] as DshWebRoute;
    const { res, state } = fakeRes();
    await route.handler({ method: 'GET', url: `${API_PREFIX}/issues` }, res);

    expect(JSON.parse(state.body)).toMatchObject({
      ok: false,
      error: {
        code: 'auth-required',
        message: 'Inventory 登录态失效了',
        helpUrl: 'https://inventory.example.test/login',
      },
    });
  });
});

describe('healthHandler', () => {
  it('身份取自 profileContext，而不是环境变量', () => {
    const { ctx } = fakeCtx();
    const payload = healthHandler(ctx)(new URLSearchParams()) as Record<string, unknown>;
    expect(payload.profile).toBe('workbench');
    expect(payload.profileDir).toBe('/Users/x/.dsh/profiles/workbench');
    expect(payload.ok).toBe(true);
  });

  it('没有 profileContext 时给出 null 而不是崩', () => {
    const { ctx } = fakeCtx();
    const bare: DshHostContext = { ...ctx, get: () => undefined };
    const payload = healthHandler(bare)(new URLSearchParams()) as Record<string, unknown>;
    expect(payload.profile).toBeNull();
    expect(payload.profileDir).toBeNull();
  });
});

describe('flag / param', () => {
  it('flag：有 key 无值 / 1 / true 都算真', () => {
    const search = new URLSearchParams('bare&one=1&yes=true&no=false');
    expect(flag(search, 'bare')).toBe(true);
    expect(flag(search, 'one')).toBe(true);
    expect(flag(search, 'yes')).toBe(true);
    expect(flag(search, 'no')).toBe(false);
    expect(flag(search, 'missing')).toBe(false);
  });

  it('param：空串等同于没给', () => {
    const search = new URLSearchParams('empty=&value=x');
    expect(param(search, 'empty')).toBeUndefined();
    expect(param(search, 'value')).toBe('x');
    expect(param(search, 'missing')).toBeUndefined();
  });
});

describe('registerProvision（机器供给：POST /workbench/api/provision）', () => {
  function harness(
    handle: (request: { action: string; unit: string }) => unknown,
    facts?: { bump(facts: readonly string[]): unknown },
  ) {
    const registered: Array<{ path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = [];
    const ctx = {
      webServer: {
        register: (options: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
          registered.push(options);
          return () => {};
        },
      },
    } as never;
    registerProvision(ctx, { handle } as never, facts);
    return registered[0];
  }

  function exchange(body: unknown, method = 'POST') {
    const chunks = [Buffer.from(JSON.stringify(body))];
    const req = {
      method,
      on: () => {},
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return { next: async () => (index < chunks.length ? { value: chunks[index++], done: false } : { value: undefined, done: true }) };
      },
    };
    const res = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: '',
      setHeader(name: string, value: string) { this.headers[name] = value; },
      end(chunk: string) { this.body = chunk; },
    };
    return { req, res };
  }

  it('POST + { action, unit } → 转给处理器，并回它给的东西', async () => {
    const calls: Array<{ action: string; unit: string }> = [];
    const route = harness((request) => {
      calls.push(request);
      return { ok: true, module: { unit: request.unit } };
    });

    const { req, res } = exchange({ action: 'install', unit: 'issues' });
    await route?.handler(req, res);

    expect(calls).toEqual([{ action: 'install', unit: 'issues' }]);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, module: { unit: 'issues' } });
  });

  it('★ 一次供给动作点名声明的两条事实（能力 + 面板配置 —— 面板装的与 agent 装的一样触发刷新）', async () => {
    const bumped: Array<readonly string[]> = [];
    const route = harness(() => ({ ok: true }), { bump: (facts) => bumped.push(facts) });

    const { req, res } = exchange({ action: 'update', unit: 'inventory' });
    await route?.handler(req, res);

    expect(bumped).toEqual([['capability', 'panels']]);
  });

  it('★ 失败的供给也记一笔（npm 可能已经写了一半 —— 宁可多刷一次）', async () => {
    const bumped: Array<readonly string[]> = [];
    const route = harness(
      () => {
        throw new Error('装到一半 npm 报错');
      },
      { bump: (facts) => bumped.push(facts) },
    );

    const { req, res } = exchange({ action: 'install', unit: 'issues' });
    await route?.handler(req, res);

    expect(bumped).toEqual([['capability', 'panels']]);
  });

  it('非 POST → 405（机器供给是执行动作，不许 GET）', async () => {
    const route = harness(() => ({ ok: true }));

    const { req, res } = exchange({ action: 'install', unit: 'issues' }, 'GET');
    await route?.handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  it('★ 不认识的 action → 400（**不是静默忽略**：形状是这条路由自己的契约）', async () => {
    const route = harness(() => ({ ok: true }));

    const { req, res } = exchange({ action: 'destroy', unit: 'issues' });
    await route?.handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toContain('不认识的 action：destroy');
  });

  it('action 缺失 → 400', async () => {
    const route = harness(() => ({ ok: true }));

    const { req, res } = exchange({ unit: 'issues' });
    await route?.handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('workbench/bad-action');
  });

  it('没有 unit → 400（客户端只发 { action, unit }，命令由宿主侧决定）', async () => {
    const route = harness(() => ({ ok: true }));

    const { req, res } = exchange({ action: 'install' });
    await route?.handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('workbench/no-unit');
  });

  it('处理器抛错 → 200 + { ok:false, error }（与数据层错误同一口径）', async () => {
    const route = harness(() => {
      throw new Error('装失败了');
    });

    const { req, res } = exchange({ action: 'install', unit: 'issues' });
    await route?.handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: { message: '装失败了' } });
  });
});

describe('registerPrefs（偏好写：POST /workbench/api/prefs/<resource>）', () => {
  const table = [
    { resource: 'a', handle: () => ({ ok: true, from: 'a' }) },
    { resource: 'b', handle: () => ({ ok: true, from: 'b' }) },
  ];

  function prefsRequest(url: string, body: unknown = {}, method = 'POST'): DshRequest {
    const chunks = [Buffer.from(JSON.stringify(body))];
    return {
      method,
      url,
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () =>
            index < chunks.length
              ? { value: chunks[index++], done: false }
              : { value: undefined, done: true },
        };
      },
    } as unknown as DshRequest;
  }

  async function run(url: string, method = 'POST') {
    const { ctx, registered } = fakeCtx();
    registerPrefs(ctx, table);
    const route = registered[0] as DshWebRoute;
    const { res, state } = fakeRes();
    await route.handler(prefsRequest(url, {}, method), res);
    return state;
  }

  it('★ 多个资源也只注册**一条**前缀 —— 每条注册都占同一个 path，dsh 对重复前缀直接抛', () => {
    const { ctx, registered } = fakeCtx();
    registerPrefs(ctx, table);

    expect(registered.map((route) => route.path)).toEqual([PREFS_PREFIX]);
  });

  it('按资源名分发：各自打到自己的 handler', async () => {
    const state = await run(`${PREFS_PREFIX}/b`);

    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual({ ok: true, from: 'b' });
  });

  it('没有这个资源 → 404（而不是打到别人的 handler）', async () => {
    const state = await run(`${PREFS_PREFIX}/nope`);

    expect(state.statusCode).toBe(404);
    expect((JSON.parse(state.body) as { error: { code: string } }).error.code).toBe('not-found');
  });

  it('非 POST → 405（偏好写是写通道）', async () => {
    const state = await run(`${PREFS_PREFIX}/a`, 'GET');

    expect(state.statusCode).toBe(405);
  });

  it('handler 抛错 → 200 + { ok:false }（与投影同口径：是状态不是 HTTP 异常）', async () => {
    const { ctx, registered } = fakeCtx();
    registerPrefs(ctx, [
      {
        resource: 'boom',
        handle: () => {
          throw new Error('写失败了');
        },
      },
    ]);
    const route = registered[0] as DshWebRoute;
    const { res, state } = fakeRes();
    await route.handler(prefsRequest(`${PREFS_PREFIX}/boom`), res);

    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toMatchObject({ ok: false, error: { message: '写失败了' } });
  });
});

describe('changesHandler（变更流连不上时的降级档）', () => {
  const log = {
    epoch: () => 'e-test',
    since: (n: number) => ({ rev: 5, facts: n < 5 ? ['panels'] : [] }),
  };

  it('带 since → 只回更新的事实（并带上纪元，客户端据此发现宿主重载过）', () => {
    const route = changesHandler(log);
    expect(route(new URLSearchParams('since=3'))).toEqual({
      ok: true,
      epoch: 'e-test',
      rev: 5,
      facts: ['panels'],
    });
  });

  it('不带 since（首次）→ 也算 0', () => {
    const route = changesHandler(log);
    expect(route(new URLSearchParams(''))).toEqual({ ok: true, epoch: 'e-test', rev: 5, facts: ['panels'] });
  });

  it('since 已经追上 → facts 为空（客户端据此不刷新）', () => {
    const route = changesHandler(log);
    expect(route(new URLSearchParams('since=5'))).toEqual({ ok: true, epoch: 'e-test', rev: 5, facts: [] });
  });
});

describe('registerActions（动作：POST /workbench/api/actions/<resource>）', () => {
  const table = [
    { resource: 'inventory-release', handle: () => ({ ok: true, from: 'release' }) },
    { resource: 'other', handle: () => ({ ok: true, from: 'other' }) },
  ];

  function request(url: string, method = 'POST'): DshRequest {
    const chunks = [Buffer.from('{}')];
    return {
      method,
      url,
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () =>
            index < chunks.length ? { value: chunks[index++], done: false } : { value: undefined, done: true },
        };
      },
    } as unknown as DshRequest;
  }

  async function run(url: string, method = 'POST') {
    const { ctx, registered } = fakeCtx();
    registerActions(ctx, table);
    const route = registered[0] as DshWebRoute;
    const { res, state } = fakeRes();
    await route.handler(request(url, method), res);
    return { state, paths: registered.map((item) => item.path) };
  }

  it('只注册**一条**前缀，且挂在 `/workbench/api/actions` 上（与偏好写各走各的）', async () => {
    const { paths } = await run(`${ACTIONS_PREFIX}/other`);

    expect(paths).toEqual([ACTIONS_PREFIX]);
    expect(ACTIONS_PREFIX).not.toBe(PREFS_PREFIX);
  });

  it('按资源名分发', async () => {
    const { state } = await run(`${ACTIONS_PREFIX}/inventory-release`);

    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual({ ok: true, from: 'release' });
  });

  it('没有这个动作 → 404；非 POST → 405（写通道）', async () => {
    const missing = await run(`${ACTIONS_PREFIX}/nope`);
    expect(missing.state.statusCode).toBe(404);

    const wrongMethod = await run(`${ACTIONS_PREFIX}/other`, 'GET');
    expect(wrongMethod.state.statusCode).toBe(405);
  });
});
