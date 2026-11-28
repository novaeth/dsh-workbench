import type { DshRequest, DshResponse } from '@dsh-workbench/shared/host';
import { emptyWorld, READ_ROUTES, type World } from '@dsh-workbench/testkit';
import { createFactLog, type FactLog } from '@dsh-workbench/shared/host';
import { reply, sendJson } from './reply';
import { REAL_SCENE, SCENES, sceneById, type Scene } from './scenes';
import { pathOf, TAKEOVER_ROUTES, validateTakeover, type TakeoverRoute } from './takeover';

const CONTROL_ENDPOINT = '/workbench/api/__fixture/scene';
const SCENES_ENDPOINT = '/workbench/api/__fixture/scenes';
const TAKEOVER_ENDPOINT = '/workbench/api/__fixture/takeover';
const EVENTS_PATH = '/workbench/events';

const FACT_ROUTES = READ_ROUTES.filter((route) => route !== 'changes');

interface HeldReply {
  readonly route: string;
  readonly req: DshRequest;
  readonly res: DshResponse;
}

interface HeldWrite {
  readonly route: string;
  readonly req: DshRequest;
  readonly res: DshResponse;
}

export interface FixtureHost {
  readonly routes: readonly TakeoverRoute[];
  readonly paths: readonly string[];
  readonly endpoints: readonly string[];
  world(): World;
  scene(): Scene;
  setScene(id: string): Scene | undefined;
  handle(route: string, req: DshRequest, res: DshResponse): Promise<void>;
  handleWrite(route: string, req: DshRequest, res: DshResponse): Promise<void>;
  control(req: DshRequest, res: DshResponse): Promise<void>;
  scenes(req: DshRequest, res: DshResponse): void;
  events(req: DshRequest, res: DshResponse): void;
  close(): void;
}

function queryOf(req: DshRequest): URLSearchParams {
  const raw = req.url ?? '/';
  const cut = raw.indexOf('?');
  return new URLSearchParams(cut === -1 ? '' : raw.slice(cut + 1));
}

async function bodyOf(req: DshRequest): Promise<string> {
  if (typeof req[Symbol.asyncIterator] !== 'function') return '';
  const chunks: Uint8Array[] = [];
  for await (const chunk of req as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export interface FixtureHostOptions {
  readonly onScene?: (id: string) => void;
}

export function createFixtureHost(
  initial: World = emptyWorld(),
  options: FixtureHostOptions = {},
): FixtureHost {
  const problems = validateTakeover(TAKEOVER_ROUTES);
  if (problems.length > 0) {
    throw new Error(`夹具接管清单不合法：${problems.join('；')}`);
  }
  const log: FactLog = createFactLog();
  const held = new Set<HeldReply>();
  const heldWrites = new Set<HeldWrite>();
  const streams = new Set<DshResponse>();
  let current: Scene = REAL_SCENE;
  let world = initial;

  const releaseHeld = async (): Promise<void> => {
    for (const item of [...held]) {
      held.delete(item);
      await reply(world, item.route, item.req, item.res);
    }
    for (const item of [...heldWrites]) {
      heldWrites.delete(item);
      await writeTo(item.route, item.res);
    }
  };

  const writeTo = async (route: string, res: DshResponse): Promise<void> => {
    const mode = world.writes?.[route] ?? { kind: 'ok' as const };
    if (mode.kind === 'hang') {
      heldWrites.add({ route, req: {} as DshRequest, res });
      return;
    }
    if (mode.kind === 'fail') {
      sendJson(res, mode.status ?? 500, {
        ok: false,
        error: { code: mode.code, message: mode.message, ...(mode.detail === undefined ? {} : { detail: mode.detail }) },
      });
      return;
    }
    log.bump(mode.facts ?? FACT_ROUTES);
    sendJson(res, 200, { ok: true, route });
  };

  const switchTo = async (scene: Scene): Promise<void> => {
    current = scene;
    world = scene.world;
    log.bump(FACT_ROUTES);
    options.onScene?.(scene.id);
    await releaseHeld();
  };

  return {
    routes: TAKEOVER_ROUTES,
    paths: TAKEOVER_ROUTES.map((item) => pathOf(item.route)),
    endpoints: [CONTROL_ENDPOINT, SCENES_ENDPOINT, TAKEOVER_ENDPOINT, EVENTS_PATH],
    world: () => world,
    scene: () => current,
    setScene(id) {
      const scene = sceneById(id);
      if (scene === undefined) return undefined;
      void switchTo(scene);
      return scene;
    },
    async handle(route, req, res) {
      if (route === 'changes') {
        const since = Number(queryOf(req).get('since') ?? 0) || 0;
        sendJson(res, 200, { ok: true, ...log.since(since) });
        return;
      }
      const result = await reply(world, route, req, res);
      if (result.held) held.add({ route, req, res });
    },
    async handleWrite(route, _req, res) {
      await writeTo(route, res);
    },
    async control(req, res) {
      if (req.method !== undefined && req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '只支持 POST' } });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await bodyOf(req));
      } catch (error) {
        console.warn('[fixture] 控制面请求体不是 JSON', error);
        sendJson(res, 400, { ok: false, error: { code: 'invalid-json', message: '请求体不是 JSON' } });
        return;
      }
      const id = parsed !== null && typeof parsed === 'object' ? (parsed as { scene?: unknown }).scene : undefined;
      if (typeof id !== 'string') {
        sendJson(res, 400, { ok: false, error: { code: 'invalid-scene', message: '缺 scene' } });
        return;
      }
      if (id === REAL_SCENE.id) {
        options.onScene?.(REAL_SCENE.id);
        sendJson(res, 200, { ok: true, scene: REAL_SCENE.id, epoch: log.epoch(), rev: log.revision(), facts: [] });
        return;
      }
      const scene = sceneById(id);
      if (scene === undefined) {
        sendJson(res, 404, { ok: false, error: { code: 'unknown-scene', message: `没有这个场景：${id}` } });
        return;
      }
      await switchTo(scene);
      sendJson(res, 200, {
        ok: true,
        scene: scene.id,
        epoch: log.epoch(),
        rev: log.revision(),
        facts: log.since(0).facts,
      });
    },
    scenes(_req, res) {
      sendJson(res, 200, {
        ok: true,
        current: current.id,
        scenes: SCENES.map((scene) => ({ id: scene.id, label: scene.label, note: scene.note ?? '' })),
        routes: TAKEOVER_ROUTES,
        paths: TAKEOVER_ROUTES.map((item) => pathOf(item.route)),
      });
    },
    events(req, res) {
      if (req.method !== undefined && req.method !== 'GET') {
        res.statusCode = 405;
        res.end();
        return;
      }
      const opening = log.since(Number(queryOf(req).get('since') ?? 0) || 0);
      if (typeof res.write !== 'function') {
        sendJson(res, 200, { ok: true, ...opening });
        return;
      }
      const headers = [
        ['content-type', 'text/event-stream; charset=utf-8'],
        ['cache-control', 'no-store, no-transform'],
        ['connection', 'keep-alive'],
      ] as const;
      if (typeof res.writeHead === 'function') res.writeHead(200, Object.fromEntries(headers));
      else {
        res.statusCode = 200;
        for (const [name, value] of headers) res.setHeader(name, value);
      }
      const frame = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;
      res.write(': connected\n\n');
      res.write(frame({ type: 'sync', ...opening }));
      streams.add(res);
      const off = log.subscribe((change) => res.write?.(frame({ type: 'bump', ...change })));
      res.on?.('close', () => {
        off();
        streams.delete(res);
      });
    },
    close() {
      for (const res of [...streams]) {
        streams.delete(res);
        res.end?.();
      }
      for (const item of [...held]) {
        held.delete(item);
        item.res.end?.();
      }
    },
  };
}

export { CONTROL_ENDPOINT, EVENTS_PATH, SCENES_ENDPOINT, TAKEOVER_ENDPOINT };
