import { describe, expect, it } from 'vitest';
import type { DshRequest, DshResponse } from '@dsh-workbench/shared/host';
import {
  capabilityOf,
  installedModule,
  panelUnit,
  workspacePanel,
  world,
} from '@dsh-workbench/testkit';
import { createFixtureHost } from '../host';
import { TAKEOVER_ROUTES, pathOf, validateTakeover } from '../takeover';

function fakeResponse(): { res: DshResponse; read(): { status: number; body: unknown } } {
  const state: { status: number; body: string } = { status: 0, body: '' };
  const res = {
    statusCode: 0,
    setHeader: () => undefined,
    end: (body: string) => {
      state.status = res.statusCode;
      state.body = body;
    },
  } as unknown as DshResponse;
  return {
    res,
    read: () => ({ status: state.status, body: state.body === '' ? null : JSON.parse(state.body) }),
  };
}

function request(url: string): DshRequest {
  return { url } as DshRequest;
}

function sample() {
  return world({
    modules: [installedModule('issues')],
    capabilities: [capabilityOf('issues')],
    workspaces: [workspacePanel('w1', [panelUnit('issues')], { path: '/repo' })],
  });
}

describe('夹具宿主：只接管清单里的精确路由', () => {
  it('★ 清单本身合法，且每条路径都在工作台 API 前缀下', () => {
    expect(validateTakeover(TAKEOVER_ROUTES)).toEqual([]);
    expect(TAKEOVER_ROUTES.map((item) => pathOf(item.route))).toContain('/workbench/api/unit-manifests');
    expect(TAKEOVER_ROUTES.every((item) => pathOf(item.route).startsWith('/workbench/api/'))).toBe(true);
  });

  it('读口按世界投影作答', async () => {
    const host = createFixtureHost(sample());
    const { res, read } = fakeResponse();

    await host.handle('unit-manifests', request('/workbench/api/unit-manifests'), res);

    const reply = read();
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ manifests: [{ id: 'issues' }] });
  });

  it('★ preflight 也走读口信封：客户端按 ok 判断，不能收到裸快照', async () => {
    const host = createFixtureHost();
    const { res, read } = fakeResponse();

    await host.handle('preflight', request('/workbench/api/preflight'), res);

    expect(read().body).toMatchObject({ ok: true, phase: 'ready' });
  });

  it('panels 按 path 选中工作区', async () => {
    const host = createFixtureHost(sample());
    const { res, read } = fakeResponse();

    await host.handle('panels', request('/workbench/api/panels?path=%2Frepo'), res);

    expect(read().body).toMatchObject({ units: [{ id: 'issues' }] });
  });

  it('★ HTTP 故障返回真实状态码，不改写成 200 信封', async () => {
    const host = createFixtureHost(world({ faults: { 'unit-manifests': { kind: 'http', status: 503 } } }));
    const { res, read } = fakeResponse();

    await host.handle('unit-manifests', request('/workbench/api/unit-manifests'), res);

    expect(read().status).toBe(503);
  });

  it('适配器故障由宿主侧信封表达', async () => {
    const host = createFixtureHost(
      world({ faults: { 'unit-manifests': { kind: 'adapter-error', error: '注册表连不上' } } }),
    );
    const { res, read } = fakeResponse();

    await host.handle('unit-manifests', request('/workbench/api/unit-manifests'), res);

    expect(read()).toMatchObject({ status: 500, body: { ok: false, error: { code: 'read-failed' } } });
  });

  it('prefs/panels 用更深的 exact 路径盖住 core 的 prefs 前缀', async () => {
    const host = createFixtureHost(sample());
    const { res, read } = fakeResponse();

    await host.handleWrite('prefs/panels', request('/workbench/api/prefs/panels'), res);

    expect(read().body).toMatchObject({ ok: true, route: 'prefs/panels' });
  });

  it('清单外的路由不会在这里被答成 200', async () => {
    const host = createFixtureHost(sample());
    const { res, read } = fakeResponse();

    await host.handle('not-taken', request('/workbench/api/not-taken'), res);

    expect(read().status).toBe(404);
  });
});
