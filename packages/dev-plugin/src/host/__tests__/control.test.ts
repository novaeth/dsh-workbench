import { describe, expect, it } from 'vitest';
import type { DshRequest, DshResponse } from '@dsh-workbench/shared/host';
import { world } from '@dsh-workbench/testkit';
import { createFixtureHost } from '../host';

interface FakeResponse {
  res: DshResponse;
  status(): number;
  body(): unknown;
  text(): string;
  ended(): boolean;
}

function fakeResponse(): FakeResponse {
  const state = { status: 0, chunks: [] as string[], ended: false };
  const res = {
    statusCode: 0,
    headers: {},
    setHeader: () => undefined,
    writeHead: (status: number) => {
      state.status = status;
    },
    write: (chunk: string) => {
      state.chunks.push(chunk);
    },
    end: (chunk?: string) => {
      if (state.status === 0) state.status = res.statusCode;
      if (typeof chunk === 'string') state.chunks.push(chunk);
      state.ended = true;
    },
    on: () => undefined,
  } as unknown as DshResponse;
  return {
    res,
    status: () => state.status,
    body: () => {
      const raw = state.chunks.join('');
      return raw === '' ? null : JSON.parse(raw);
    },
    text: () => state.chunks.join(''),
    ended: () => state.ended,
  };
}

function controlRequest(body: unknown): DshRequest {
  return {
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as unknown as DshRequest;
}

function getRequest(url: string): DshRequest {
  return { method: 'GET', url } as DshRequest;
}

describe('场景控制面', () => {
  it('★ 切场景是改世界 + 推一帧 facts，不动进程', async () => {
    const host = createFixtureHost();
    const response = fakeResponse();

    await host.control(controlRequest({ scene: 'market-installed' }), response.res);

    expect(response.status()).toBe(200);
    expect(response.body()).toMatchObject({ ok: true, scene: 'market-installed', rev: 1 });
    expect((response.body() as { facts: string[] }).facts).toContain('unit-manifests');
    expect(host.world().machine.modules.length).toBeGreaterThan(0);
  });

  it('重置到 real 会改 current，不只是回一句 ok', async () => {
    const host = createFixtureHost();
    await host.control(controlRequest({ scene: 'market-installed' }), fakeResponse().res);

    const response = fakeResponse();
    await host.control(controlRequest({ scene: 'real' }), response.res);

    expect(response.status()).toBe(200);
    expect(response.body()).toMatchObject({ ok: true, scene: 'real' });
    expect(host.scene().id).toBe('real');
    expect(host.world().machine.modules).toEqual([]);
  });

  it('场景清单带分组：面板与面板配置分开', () => {
    const host = createFixtureHost();
    const response = fakeResponse();

    host.scenes(getRequest('/workbench/api/__fixture/scenes'), response.res);

    const body = response.body() as { scenes: { id: string; group: string }[] };
    const groupOf = (id: string): string | undefined => body.scenes.find((scene) => scene.id === id)?.group;
    expect(groupOf('panel-empty')).toBe('面板');
    expect(groupOf('panel-unread')).toBe('面板');
    expect(groupOf('panel-one')).toBe('面板');
    expect(groupOf('panel-many-cards')).toBe('面板');
    expect(groupOf('panel-card-crash')).toBe('面板');
    expect(groupOf('panel-step')).toBe('面板');
    expect(groupOf('panel-manifests-reading')).toBe('面板');
    expect(groupOf('panel-read-failed')).toBe('面板');
    expect(groupOf('panel-manifests-failed')).toBe('面板');
    expect(groupOf('panel-rows')).toBe('面板配置');
    expect(groupOf('panel-unchecked')).toBe('面板配置');
  });

  it('changes 按 since 返回增量，epoch 不换', async () => {
    const host = createFixtureHost();
    await host.control(controlRequest({ scene: 'market-installed' }), fakeResponse().res);

    const response = fakeResponse();
    await host.handle('changes', getRequest('/workbench/api/changes?since=0'), response.res);
    const first = response.body() as { epoch: string; rev: number; facts: string[] };

    const after = fakeResponse();
    await host.handle('changes', getRequest(`/workbench/api/changes?since=${first.rev}`), after.res);

    expect(first).toMatchObject({ ok: true, rev: 1 });
    expect(after.body()).toMatchObject({ ok: true, rev: 1, facts: [] });
  });

  it('未知场景与非法请求体都回 4xx', async () => {
    const host = createFixtureHost();
    const unknown = fakeResponse();
    const invalid = fakeResponse();

    await host.control(controlRequest({ scene: 'nope' }), unknown.res);
    await host.control(controlRequest({}), invalid.res);

    expect(unknown.status()).toBe(404);
    expect(invalid.status()).toBe(400);
  });

  it('★ 切场景释放挂起的请求，不让页面卡在上一屏', async () => {
    const host = createFixtureHost(
      world({ faults: { 'unit-manifests': { kind: 'hang' } } }),
    );
    const response = fakeResponse();

    await host.handle('unit-manifests', getRequest('/workbench/api/unit-manifests'), response.res);
    expect(response.ended()).toBe(false);

    host.setScene('market-installed');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(response.ended()).toBe(true);
    expect(response.status()).toBe(200);
  });

  it('★ 写路由被接管：默认成功，失败按世界给状态码', async () => {
    const okHost = createFixtureHost();
    const ok = fakeResponse();
    await okHost.handleWrite('provision', getRequest('/workbench/api/provision'), ok.res);

    const failing = createFixtureHost(
      world({
        writes: { provision: { kind: 'fail', status: 409, code: 'busy', message: '另一个安装还在跑' } },
      }),
    );
    const bad = fakeResponse();
    await failing.handleWrite('provision', getRequest('/workbench/api/provision'), bad.res);

    expect(ok.body()).toMatchObject({ ok: true, route: 'provision' });
    expect(bad.status()).toBe(409);
    expect(bad.body()).toMatchObject({ ok: false, error: { code: 'busy' } });
  });

  it('写挂起也会在切场景时释放', async () => {
    const host = createFixtureHost(world({ writes: { provision: { kind: 'hang' } } }));
    const response = fakeResponse();

    await host.handleWrite('provision', getRequest('/workbench/api/provision'), response.res);
    expect(response.ended()).toBe(false);

    host.setScene('market-installed');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(response.ended()).toBe(true);
  });

  it('★ SSE 先同步再推送，客户端不用刷新', async () => {
    const host = createFixtureHost();
    const response = fakeResponse();

    host.events(getRequest('/workbench/events?since=0'), response.res);
    host.setScene('market-installed');
    await new Promise((resolve) => setTimeout(resolve, 10));

    const text = response.text();
    expect(text).toContain('"type":"sync"');
    expect(text).toContain('"type":"bump"');
    expect(text).toContain('unit-manifests');
  });
});
