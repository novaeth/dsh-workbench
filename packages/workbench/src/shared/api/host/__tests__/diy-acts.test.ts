import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshResponse, DshWebRoute } from '@dsh-workbench/shared';
import { createDebugStore, createRecordStore } from '@dsh-workbench/shared/host';
import { takeHeldNotices } from '../diy-debug-act';
import { registerDiyActs } from '../diy-acts';

interface FakeServer {
  readonly ctx: DshHostContext;
  readonly live: Set<string>;
  readonly routes: Map<string, DshWebRoute>;
  readonly bumps: string[][];
}

function fakeServer(): FakeServer {
  const live = new Set<string>();
  const routes = new Map<string, DshWebRoute>();
  const bumps: string[][] = [];
  const ctx: DshHostContext = {
    get: <T,>() => undefined as T,
    provide: () => () => {},
    effect: () => () => {},
    inject: () => () => {},
    logger: { info: () => {}, warn: () => {} },
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
  return { ctx, live, routes, bumps };
}

function post(url: string, body: unknown): DshRequest {
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

async function drive(server: FakeServer, path: string, body: unknown): Promise<Record<string, unknown>> {
  const route = server.routes.get(path);
  if (route === undefined) throw new Error(`没有注册 ${path}`);
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
  await route.handler(post(`${path}/act`, body), res);
  return JSON.parse(state.body) as Record<string, unknown>;
}

const pact = {
  sessionId: 's1',
  workspace: '/w/workbench/diy',
  unit: 'inventory',
  name: 'inventory',
  url: 'https://inventory.example.com/env',
  title: '',
  action: '发布',
  expect: null,
  captureFile: '/w/workbench/diy/shots/rec-inventory.jsonl',
  now: Date.now(),
};

describe('两族的用户键：各自一条写前缀，接上与拆掉都成对', () => {
  it('★★ 一次注册两条前缀（调试 + 录制交接），dispose 把两条都拆掉', () => {
    const server = fakeServer();

    const dispose = registerDiyActs(server.ctx, { bump: (names) => server.bumps.push([...names]) });

    expect([...server.routes.keys()].sort()).toEqual([
      '/workbench/api/diy-debug',
      '/workbench/api/diy-record',
    ]);
    dispose();
    expect(server.routes.size).toBe(0);
    expect(server.live.size).toBe(0);
  });

  it('★★ 录制那一族的「收工」真的走通：释放 + 清状态 + 亮这条事实', async () => {
    const store = createRecordStore();
    store.begin(pact);
    const released: string[] = [];
    const withRelease = {
      ...store,
      release: async () => {
        released.push('called');
        return { tab: true, capture: true };
      },
    };
    const server = fakeServer();
    const ctx: DshHostContext = {
      ...server.ctx,
      get: <T,>(name: string) => (name === 'workbenchDiyRecord' ? (withRelease as unknown as T) : undefined),
    };

    const dispose = registerDiyActs(ctx, { bump: (names) => server.bumps.push([...names]) });
    const answer = await drive(server, '/workbench/api/diy-record', { intent: 'stop' });

    expect(answer['ok']).toBe(true);
    expect(released).toEqual(['called']);
    expect(store.live(Date.now())).toBeNull();
    expect(server.bumps).toEqual([['diy-record']]);
    dispose();
  });

  it('★★ 调试那一族挂的是同一份注册：store 拿不到就当场拒（不抛、也不静默）', async () => {
    const server = fakeServer();

    const dispose = registerDiyActs(server.ctx, { bump: () => {} });
    const answer = await drive(server, '/workbench/api/diy-debug', { intent: 'stop' });

    expect(answer['ok']).toBe(false);
    expect(JSON.stringify(answer)).toContain('调试');
    dispose();
  });

  it('★★ 调试那一族按它自己的话术走：有约定 ⇒ 改状态 + 给 agent 一条 notice', async () => {
    const debug = createDebugStore();
    debug.begin({
      sessionId: 's1',
      workspacePath: '/w/workbench/diy',
      title: '工坊',
      board: '/w/workbench/diy',
      unit: 'demo',
      name: 'demo',
      now: Date.now(),
    });
    const sent: unknown[] = [];
    const server = fakeServer();
    const ctx: DshHostContext = {
      ...server.ctx,
      get: <T,>(name: string) => {
        if (name === 'workbenchDiyDebug') return debug as unknown as T;
        if (name === 'agents') {
          return {
            get: () => ({
              status: 'idle',
              inject: (message: unknown) => sent.push(message),
              followup: (message: unknown) => sent.push(message),
            }),
          } as unknown as T;
        }
        return undefined;
      },
    };

    const dispose = registerDiyActs(ctx, { bump: () => {} });
    const answer = await drive(server, '/workbench/api/diy-debug', { intent: 'pause' });

    expect(answer['ok']).toBe(true);
    expect(debug.live(Date.now())?.phase).toBe('paused');
    expect(sent).toHaveLength(0);
    const queued = takeHeldNotices('s1');
    expect(queued).toHaveLength(1);
    expect(JSON.stringify(queued[0])).toContain('暂停');
    dispose();
  });

  it('★ 意图不认就当场拒（那一族的回执里说清只认哪三个词）', async () => {
    const store = createRecordStore();
    store.begin(pact);
    const server = fakeServer();
    const ctx: DshHostContext = {
      ...server.ctx,
      get: <T,>(name: string) => (name === 'workbenchDiyRecord' ? (store as unknown as T) : undefined),
    };

    const dispose = registerDiyActs(ctx, { bump: () => {} });
    const answer = await drive(server, '/workbench/api/diy-record', { intent: 'cancel' });

    expect(answer['ok']).toBe(false);
    expect(JSON.stringify(answer)).toContain('peek');
    expect(store.live(Date.now())?.phase).toBe('armed');
    dispose();
  });
});
