import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshWebRoute } from '../../../api/dsh.js';
import { ACTIONS_PREFIX, API_PREFIX } from '../../../config/constants.js';
import { createDiagRecorder } from '../diag-records.js';
import { registerActions, registerApi } from '../http.js';

function fakeCtx(): { ctx: DshHostContext; registered: DshWebRoute[] } {
  const registered: DshWebRoute[] = [];
  const ctx = {
    webServer: {
      register: (route: DshWebRoute) => {
        registered.push(route);
        return () => {};
      },
    },
  } as unknown as DshHostContext;
  return { ctx, registered };
}

function fakeRes(): { res: never; state: { statusCode: number; body: string } } {
  const state = { statusCode: 0, body: '' };
  const res = {
    set statusCode(value: number) {
      state.statusCode = value;
    },
    get statusCode() {
      return state.statusCode;
    },
    setHeader: () => {},
    end: (chunk?: string) => {
      state.body = chunk ?? '';
    },
  };
  return { res: res as never, state };
}

function get(url: string): DshRequest {
  return { method: 'GET', url } as unknown as DshRequest;
}

function post(url: string, body: unknown = {}): DshRequest {
  const chunks = [Buffer.from(JSON.stringify(body))];
  return {
    method: 'POST',
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

function recorderOf(): ReturnType<typeof createDiagRecorder> {
  let seq = 0;
  return createDiagRecorder({ nextCorrId: () => `c-${String(++seq)}`, level: 'info' });
}

async function call(
  route: DshWebRoute,
  request: DshRequest,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const { res, state } = fakeRes();
  await route.handler(request, res);
  return { statusCode: state.statusCode, body: JSON.parse(state.body) as Record<string, unknown> };
}

describe('读口的失败回执与记录', () => {
  it('★ 路由回 ok:false：记一条 READ_FAILED，回执带关联号，区域按路由归位', async () => {
    const recorder = recorderOf();
    const { ctx, registered } = fakeCtx();
    registerApi(
      ctx,
      {
        'market/list': () => ({ ok: false, error: { code: 'read-failed', message: '远端没接上\n堆栈第二行' } }),
      },
      recorder,
    );

    const hit = await call(registered[0] as DshWebRoute, get(`${API_PREFIX}/market/list`));

    expect(hit.statusCode).toBe(200);
    const diag = hit.body['diag'] as { corrId: string };
    expect(diag.corrId).toMatch(/^c-/);
    const [record] = recorder.recent();
    expect(record?.code).toBe('READ_FAILED');
    expect(record?.area).toBe('market');
    expect(record?.subject?.route).toBe('market/list');
    expect(record?.cause?.message).toBe('远端没接上');
    expect(record?.corrId).toBe(diag.corrId);
  });

  it('★ 同一路由同一窗口内再次失败：复用关联号，不再写第二条', async () => {
    const recorder = recorderOf();
    const { ctx, registered } = fakeCtx();
    registerApi(ctx, { 'panels/read': () => ({ ok: false, error: { code: 'read-failed', message: 'x' } }) }, recorder);
    const route = registered[0] as DshWebRoute;

    const first = await call(route, get(`${API_PREFIX}/panels/read`));
    const second = await call(route, get(`${API_PREFIX}/panels/read`));

    expect((second.body['diag'] as { corrId: string }).corrId).toBe(
      (first.body['diag'] as { corrId: string }).corrId,
    );
    expect(recorder.recent()).toHaveLength(1);
  });

  it('★ 路由抛错：500 回执也带关联号，记录里留首行原因', async () => {
    const recorder = recorderOf();
    const { ctx, registered } = fakeCtx();
    registerApi(
      ctx,
      {
        'panels/read': () => {
          throw new Error('适配器炸了\n第二行');
        },
      },
      recorder,
    );

    const hit = await call(registered[0] as DshWebRoute, get(`${API_PREFIX}/panels/read`));

    expect(hit.statusCode).toBe(500);
    const diag = hit.body['diag'] as { corrId: string };
    expect(diag.corrId).toMatch(/^c-/);
    expect(recorder.recent()[0]?.cause?.message).toBe('适配器炸了');
  });

  it('没有接记录器时行为照旧：不往回执里塞 diag', async () => {
    const { ctx, registered } = fakeCtx();
    registerApi(ctx, { 'panels/read': () => ({ ok: false, error: { code: 'read-failed', message: 'x' } }) });

    const hit = await call(registered[0] as DshWebRoute, get(`${API_PREFIX}/panels/read`));

    expect(hit.body['diag']).toBeUndefined();
    expect(hit.body['ok']).toBe(false);
  });
});

describe('写通道的失败回执与记录', () => {
  it('★ 资源回 ok:false：记一条 ACTION_FAILED，区域按资源名归位', async () => {
    const recorder = recorderOf();
    const { ctx, registered } = fakeCtx();
    registerActions(ctx, [{ resource: 'config-sync', handle: () => ({ ok: false, text: '写不进去' }) }], undefined, recorder);

    const hit = await call(registered[0] as DshWebRoute, post(`${ACTIONS_PREFIX}/config-sync`));

    expect(hit.statusCode).toBe(200);
    const diag = hit.body['diag'] as { corrId: string };
    expect(diag.corrId).toMatch(/^c-/);
    const [record] = recorder.recent();
    expect(record?.code).toBe('ACTION_FAILED');
    expect(record?.area).toBe('settings');
    expect(record?.subject?.route).toBe('config-sync');
    expect(record?.cause?.message).toBe('写不进去');
  });

  it('★ 资源抛错：同样记一条，回执带关联号', async () => {
    const recorder = recorderOf();
    const { ctx, registered } = fakeCtx();
    registerActions(
      ctx,
      [
        {
          resource: 'market-sources',
          handle: () => {
            throw new Error('源写不进去');
          },
        },
      ],
      undefined,
      recorder,
    );

    const hit = await call(registered[0] as DshWebRoute, post(`${ACTIONS_PREFIX}/market-sources`));

    const diag = hit.body['diag'] as { corrId: string };
    expect(diag.corrId).toMatch(/^c-/);
    expect(recorder.recent()[0]?.area).toBe('market');
  });
});
