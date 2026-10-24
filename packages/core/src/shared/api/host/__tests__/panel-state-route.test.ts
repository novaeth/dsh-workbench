import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshResponse, DshWebRoute } from '@dsh-workbench/shared';
import { ACTIONS_PREFIX, PANEL_STATE_PREFIX, PREFS_PREFIX } from '@dsh-workbench/shared/host';
import { createPanelStateStore, registerPanelState } from '@dsh-workbench/shared/host';

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
  const ctx: DshHostContext = {
    get: <T,>() => ({ dir: '/Users/x/.dsh/profiles/workbench' }) as T,
    provide: () => () => {},
    effect: () => () => {},
    inject: () => () => {},
    logger: { info: () => {}, warn: () => {} },
    webServer: {
      register: (route) => {
        registered.push(route);
        return () => {};
      },
    },
  };
  return { ctx, registered };
}

describe('registerPanelState（面板运行态：POST /workbench/api/panel-state/<cards|crash>）', () => {
  function request(url: string, body: unknown = {}, method = 'POST'): DshRequest {
    const chunks = [Buffer.from(JSON.stringify(body))];
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

  async function run(url: string, body: unknown = {}, method = 'POST') {
    const { ctx, registered } = fakeCtx();
    const store = createPanelStateStore();
    registerPanelState(ctx, store);
    const route = registered[0] as DshWebRoute;
    const { res, state } = fakeRes();
    await route.handler(request(url, body, method), res);
    return { state, store, paths: registered.map((item) => item.path) };
  }

  it('只注册**一条**前缀，挂在 /workbench/api/panel-state 上（与偏好写、动作各走各的）', async () => {
    const { paths } = await run(`${PANEL_STATE_PREFIX}/cards`);
    expect(paths).toEqual([PANEL_STATE_PREFIX]);
    expect(PANEL_STATE_PREFIX).not.toBe(PREFS_PREFIX);
    expect(PANEL_STATE_PREFIX).not.toBe(ACTIONS_PREFIX);
  });

  it('cards 上报收进 store；GET 是 405（这一条只有浏览器半侧往里写）', async () => {
    const sent = await run(`${PANEL_STATE_PREFIX}/cards`, {
      workspace: '/w/a',
      cards: [{ unit: 'demo', route: 'demo/overview', phase: 'error', at: 9, error: { code: 'host-500', message: '宿主炸了' } }],
    });
    expect(sent.state.statusCode).toBe(200);
    expect(sent.store.snapshot('/w/a').units[0]?.cards[0]?.error?.code).toBe('host-500');

    const got = await run(`${PANEL_STATE_PREFIX}/cards`, {}, 'GET');
    expect(got.state.statusCode).toBe(405);
  });

  it('crash 上报留下最新一条 + 次数', async () => {
    const { ctx, registered } = fakeCtx();
    const store = createPanelStateStore();
    registerPanelState(ctx, store);
    const route = registered[0] as DshWebRoute;
    for (const at of [10, 20]) {
      const { res } = fakeRes();
      await route.handler(request(`${PANEL_STATE_PREFIX}/crash`, { workspace: '/w/a', unit: 'demo', reason: 'boom', at }), res);
    }
    expect(store.snapshot('/w/a').units[0]?.crash).toMatchObject({ reason: 'boom', at: 20, count: 2 });
  });

  it('认不出的上报 → 200 + error.code=report-refused（是状态不是 HTTP 异常，也不写 store）', async () => {
    const { state, store } = await run(`${PANEL_STATE_PREFIX}/cards`, { workspace: '', cards: [] });
    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toMatchObject({ ok: false, error: { code: 'report-refused' } });
    expect(store.snapshot('').units).toEqual([]);
  });

  it('没有这个资源 → 404', async () => {
    const { state } = await run(`${PANEL_STATE_PREFIX}/nope`);
    expect(state.statusCode).toBe(404);
  });
});
