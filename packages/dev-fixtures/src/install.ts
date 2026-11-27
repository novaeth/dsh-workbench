import { API_PREFIX } from '@dsh-workbench/shared';
import { mountStrip } from './strip';
import { CHANGES_ROUTE, REAL_SCENE, sceneById } from './scenes';
import { applySceneUnits } from './units';

const FLAG = /(?:^|[?&])(?:wbHost|wbMock)=1(?:&|$)/;

const HOLD = Symbol('hold');

let current = REAL_SCENE;
let epoch = 0;
let rev = 0;

const sources = new Set<FakeEventSource>();
const listeners = new Set<() => void>();
const heldReleases: (() => void)[] = [];

function releaseHeld(): void {
  const pending = heldReleases.splice(0);
  for (const release of pending) release();
}

function holdReply(): Promise<Response> {
  return new Promise<Response>((resolve) => {
    heldReleases.push(() =>
      resolve(
        json({ ok: false, error: { code: 'fixture-switched', message: '假宿主：场景切了，这一帧作废' } }),
      ),
    );
  });
}

class FakeEventSource {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    sources.add(this);
    setTimeout(() => this.onopen?.(new Event('open')), 0);
  }
  close(): void {
    sources.delete(this);
  }
  push(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

function frame(): void {
  epoch += 1;
  rev += 1;
  const payload = { epoch: `wb-${epoch}`, rev, facts: [] as string[] };
  for (const source of sources) source.push(payload);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function routeOf(url: URL): string {
  return url.pathname.slice(API_PREFIX.length + 1);
}

function sceneReply(route: string, url: URL): unknown {
  const scene = sceneById(current);
  if (scene === undefined) return undefined;
  if (route === CHANGES_ROUTE) return { ok: true, epoch: `wb-${epoch}`, rev, facts: [] };
  if (scene.holds?.includes(route)) return HOLD;
  const reply = scene.routes[route];
  if (reply === undefined) return undefined;
  return typeof reply === 'function' ? (reply as (query: URLSearchParams) => unknown)(url.searchParams) : reply;
}

function installFetch(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) return realFetch(input, init);
    if (current === REAL_SCENE) return realFetch(input, init);
    const route = routeOf(url);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET') {
      const raw = sceneById(current)?.writes?.[route];
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      const write = typeof raw === 'function' ? raw(body) : raw;
      if (write === 'hold') return holdReply();
      if (write === undefined) {
        return json({ ok: false, error: { code: 'fixture', message: '假宿主：夹具里不执行写入' } });
      }
      return json(write === 'ok' ? { ok: true } : write);
    }
    const reply = sceneReply(route, url);
    if (reply === undefined) return realFetch(input, init);
    if (reply === HOLD) return holdReply();
    return json(reply);
  };
}

function installEventSource(): void {
  window.EventSource = FakeEventSource as unknown as typeof EventSource;
}

function unitsOf(id: string): readonly string[] {
  return sceneById(id)?.units?.map((item) => item.unit) ?? [];
}

function setScene(id: string): void {
  if (id !== REAL_SCENE && sceneById(id) === undefined) return;
  if (id === current) return;
  releaseHeld();
  current = id;
  applySceneUnits(unitsOf(id));
  const url = new URL(window.location.href);
  if (id === REAL_SCENE) url.searchParams.delete('wbScene');
  else url.searchParams.set('wbScene', id);
  window.history.replaceState(null, '', url);
  for (const listener of listeners) listener();
  if (current !== REAL_SCENE) frame();
}

function initialScene(search: string): string {
  const id = new URLSearchParams(search).get('wbScene');
  return id !== null && sceneById(id) !== undefined ? id : REAL_SCENE;
}

export function installFakeHost(): void {
  if (typeof window === 'undefined') return;
  const { location } = window;
  if (location === undefined) return;
  if (!FLAG.test(location.search)) return;
  current = initialScene(location.search);
  applySceneUnits(unitsOf(current));
  installFetch();
  installEventSource();
  const handle = mountStrip({ current, onPick: setScene });
  listeners.add(() => handle.update(current));
}
