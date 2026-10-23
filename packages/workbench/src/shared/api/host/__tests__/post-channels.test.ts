import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshResponse, DshWebRoute } from '@dsh-workbench/shared';
import { ACTIONS_PREFIX, PREFS_PREFIX, PROVISION_PREFIX } from '@dsh-workbench/shared/host';
import type { UnitsPlan } from '../mount-units.js';
import { createPostChannels } from '../post-channels.js';

interface FakeServer {
  readonly ctx: DshHostContext;
  readonly live: Set<string>;
  readonly routes: Map<string, DshWebRoute>;
  readonly warnings: string[];
}

function fakeServer(stale: readonly string[] = []): FakeServer {
  const live = new Set(stale);
  const routes = new Map<string, DshWebRoute>();
  const warnings: string[] = [];
  const ctx: DshHostContext = {
    get: <T,>() => undefined as T,
    provide: () => () => {},
    effect: () => () => {},
    inject: () => () => {},
    logger: { info: () => {}, warn: (message) => warnings.push(message) },
    webServer: {
      register: (route) => {
        const key = `${route.kind}:${route.path}`;
        if (live.has(key)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
        live.add(key);
        routes.set(route.path, route);
        return () => {
          live.delete(key);
          routes.delete(route.path);
        };
      },
    },
  };
  return { ctx, live, routes, warnings };
}

function mountedWith(plan: Partial<UnitsPlan>): ReadonlyMap<string, { readonly plan: UnitsPlan }> {
  return new Map([['panels', { plan: plan as UnitsPlan }]]);
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

function fakeRes() {
  const state = { statusCode: 0, body: '' };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    setHeader: () => {},
    end: (body: string) => {
      state.body = body ?? '';
    },
  } as unknown as DshResponse;
  return { res, state };
}

async function drive(
  server: FakeServer,
  key: string,
  url: string = key,
  body: unknown = {},
): Promise<Record<string, unknown>> {
  const route = server.routes.get(key);
  if (route === undefined) throw new Error(`没有注册 ${key}`);
  const { res, state } = fakeRes();
  await route.handler(post(url, body), res);
  return JSON.parse(state.body) as Record<string, unknown>;
}

const provision = { handle: () => ({ ok: true, action: 'install', module: {} }), affectedUnits: () => [] };

describe('createPostChannels（三条写前缀的装配）', () => {
  it('★ 三条前缀各注册一次，外壳与套件的动作资源合在同一条 actions 上', async () => {
    const server = fakeServer();
    const channels = createPostChannels({
      ctx: server.ctx,
      mounted: mountedWith({
        prefs: [{ resource: 'panels', unit: 'panels', handle: () => ({ ok: true }) }],
        actions: [{ resource: 'inventory', unit: 'inventory', handle: () => ({ ok: true }) }],
        provision,
      }),
      facts: { bump: () => undefined },
      shellActions: [{ resource: 'configSync', handle: () => ({ ok: true, from: 'shell' }) }],
    });

    channels.rebind(() => undefined);

    expect([...server.live]).toEqual([
      `prefix:${PREFS_PREFIX}`,
      `prefix:${ACTIONS_PREFIX}`,
      `prefix:${PROVISION_PREFIX}`,
    ]);
    expect(await drive(server, ACTIONS_PREFIX, ACTIONS_PREFIX, {})).toMatchObject({ ok: false });
    expect(await drive(server, ACTIONS_PREFIX, `${ACTIONS_PREFIX}/configSync`)).toMatchObject({
      ok: true,
      from: 'shell',
    });
    expect(await drive(server, ACTIONS_PREFIX, `${ACTIONS_PREFIX}/inventory`)).toMatchObject({ ok: true });
  });

  it('★ 某条前缀撞车只点名，后面的机器供给照样接上（2026-10-15 那个 405）', async () => {
    const server = fakeServer([`prefix:${ACTIONS_PREFIX}`]);
    const channels = createPostChannels({
      ctx: server.ctx,
      mounted: mountedWith({
        prefs: [{ resource: 'panels', unit: 'panels', handle: () => ({ ok: true }) }],
        actions: [{ resource: 'inventory', unit: 'inventory', handle: () => ({ ok: true }) }],
        provision,
      }),
      facts: { bump: () => undefined },
      shellActions: [],
    });

    channels.rebind(() => undefined);

    expect(server.warnings.join(' ')).toContain(ACTIONS_PREFIX);
    expect(server.live.has(`prefix:${PROVISION_PREFIX}`)).toBe(true);
    expect(await drive(server, PROVISION_PREFIX, PROVISION_PREFIX, { action: 'install', unit: 'x' })).toMatchObject({
      ok: true,
    });
  });

  it('rebind 是"撤旧再挂新"：连着来两次不会撞自己', () => {
    const server = fakeServer();
    const channels = createPostChannels({
      ctx: server.ctx,
      mounted: mountedWith({ prefs: [], actions: [], provision }),
      facts: { bump: () => undefined },
      shellActions: [],
    });

    channels.rebind(() => undefined);
    channels.rebind(() => undefined);

    expect([...server.live]).toEqual([`prefix:${PROVISION_PREFIX}`]);
  });

  it('套件都没声明时不占前缀；dispose 把挂上的全撤掉', () => {
    const server = fakeServer();
    const channels = createPostChannels({
      ctx: server.ctx,
      mounted: mountedWith({ prefs: [], actions: [], provision: undefined }),
      facts: { bump: () => undefined },
      shellActions: [],
    });

    channels.rebind(() => undefined);
    expect([...server.live]).toEqual([]);
    channels.dispose();
    expect([...server.live]).toEqual([]);
  });
});
