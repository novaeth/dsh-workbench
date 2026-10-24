import type { DshHostContext, DshRequest, DshResponse } from '../api/dsh.js';
import { unitFactScope } from './facts.js';
import { parseCardsReport, parseCrashReport, type PanelStateStore } from './panel-state.js';
import { ACTIONS_PREFIX, API_PREFIX, DIY_DEBUG_PATH, DIY_RECORD_PATH, PANEL_STATE_PREFIX, PLUGIN_ID, PREFS_PREFIX, PROVISION_PREFIX } from '../config/constants.js';
import {
  parseProvisionBody,
  type ProvisionHandler,
  type ProvisionRequest,
} from './provision.js';
import { WorkbenchDataError } from './data-error.js';
import { writeResultForClient } from './write-result.js';

export type RouteHandler = (search: URLSearchParams) => Promise<unknown> | unknown;

export type RouteTable = Record<string, RouteHandler>;

const MAX_PREFS_BODY_BYTES = 8 * 1024;

const PROVISION_FACTS = ['capability', 'panels'] as const;

function provisionFacts(provision: ProvisionHandler, request: ProvisionRequest): readonly string[] {
  const scopes = (provision.affectedUnits?.(request) ?? []).map(unitFactScope);
  return [...PROVISION_FACTS, ...scopes];
}

function sendJson(res: DshResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function isDataError(error: unknown): boolean {
  if (error instanceof WorkbenchDataError) return true;
  return (
    error instanceof Error &&
    error.name === 'WorkbenchDataError' &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

function toErrorPayload(error: unknown): Record<string, unknown> {
  if (isDataError(error)) {
    const data = error as WorkbenchDataError;
    return {
      code: data.code,
      message: data.message,
      ...(data.detail === undefined ? {} : { detail: data.detail }),
      ...(data.hint === undefined ? {} : { hint: data.hint }),
      ...(data.helpUrl === undefined ? {} : { helpUrl: data.helpUrl }),
      ...(data.project === undefined ? {} : { project: data.project }),
    };
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error) };
}

export function flag(search: URLSearchParams, name: string): boolean {
  const raw = search.get(name);
  if (raw === null) return false;
  return raw === '' || raw === '1' || raw.toLowerCase() === 'true';
}

export function param(search: URLSearchParams, name: string): string | undefined {
  const raw = search.get(name);
  return raw === null || raw === '' ? undefined : raw;
}

export function registerApi(ctx: DshHostContext, routes: RouteTable): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req: DshRequest, res: DshResponse) => {
      const raw = req.url ?? '/';
      const cut = raw.indexOf('?');
      const pathname = cut === -1 ? raw : raw.slice(0, cut);
      const search = new URLSearchParams(cut === -1 ? '' : raw.slice(cut + 1));
      const route = pathname.slice(API_PREFIX.length).replace(/^\//, '');

      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '只支持 GET' } });
        return;
      }

      const handler = Object.prototype.hasOwnProperty.call(routes, route) ? routes[route] : undefined;
      if (handler === undefined) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `没有这个接口：${route}` } });
        return;
      }

      try {
        sendJson(res, 200, await handler(search));
      } catch (error) {
        if (error instanceof WorkbenchDataError) {
          sendJson(res, 200, { ok: false, error: toErrorPayload(error) });
          return;
        }
        ctx.logger?.warn?.(`[dsh-workbench] 路由 ${route} 失败：${String(error)}`);
        sendJson(res, 500, { ok: false, error: toErrorPayload(error) });
      }
    },
  });
}

export function registerProvision(
  ctx: DshHostContext,
  provision: ProvisionHandler,
  log?: { bump(facts: readonly string[]): unknown } | undefined,
): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: PROVISION_PREFIX,
    handler: async (req: DshRequest, res: DshResponse) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '机器供给只支持 POST' } });
        return;
      }
      let payload: unknown;
      try {
        const raw = await readBoundedBody(req);
        if (raw === null) {
          sendJson(res, 413, { ok: false, error: { code: 'body-too-large', message: '请求体太大' } });
          return;
        }
        payload = raw === '' ? {} : JSON.parse(raw);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: { code: 'bad-json', message: String(error) } });
        return;
      }

      const parsed = parseProvisionBody(payload);
      if (!parsed.ok) {
        sendJson(res, 400, { ok: false, error: { code: parsed.code, message: parsed.message } });
        return;
      }
      const request: ProvisionRequest = parsed.request;
      try {
        const result = await provision.handle(request);
        log?.bump(provisionFacts(provision, request));
        sendJson(res, 200, result);
      } catch (error) {
        log?.bump(provisionFacts(provision, request));
        sendJson(res, 200, { ok: false, error: toErrorPayload(error) });
      }
    },
  });
}

export interface PostResource {
  readonly resource: string;
  readonly unit?: string;
  handle(payload: unknown): Promise<unknown> | unknown;
}

export interface PostWrite {
  readonly args: unknown;
  readonly result: unknown;
}

function registerPost(
  ctx: DshHostContext,
  options: {
    readonly prefix: string;
    readonly what: string;
    readonly resources: readonly PostResource[];
    readonly refusedCode: string;
    readonly wrote?: ((resource: string, write: PostWrite) => void) | undefined;
  },
): () => void {
  const { prefix, what, resources, refusedCode, wrote } = options;
  const table = new Map(resources.map((item) => [item.resource, item.handle] as const));
  return ctx.webServer.register({
    kind: 'prefix',
    path: prefix,
    handler: async (req: DshRequest, res: DshResponse) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: `${what}只支持 POST` } });
        return;
      }

      const raw = await readBoundedBody(req);
      if (raw === null) {
        sendJson(res, 413, { ok: false, error: { code: 'payload-too-large', message: '请求体过大' } });
        return;
      }

      let payload: unknown;
      try {
        payload = raw === '' ? {} : JSON.parse(raw);
      } catch {
        sendJson(res, 400, { ok: false, error: { code: 'bad-json', message: '请求体不是 JSON' } });
        return;
      }

      const requested = (req.url ?? '/').slice(prefix.length).replace(/^\//, '').split('?')[0] ?? '';
      const handle = table.get(requested);
      if (handle === undefined) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `没有这个${what}资源：${requested}` } });
        return;
      }
      try {
        const result = await handle(payload);
        wrote?.(requested, { args: payload, result });
        sendJson(res, 200, writeResultForClient(result, refusedCode));
      } catch (error) {
        sendJson(res, 200, { ok: false, error: toErrorPayload(error) });
      }
    },
  });
}

async function readBoundedBody(req: DshRequest): Promise<string | null> {
  if (typeof req[Symbol.asyncIterator] !== 'function') return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_PREFS_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function changesHandler(log: {
  epoch(): string;
  since(rev: number): { rev: number; facts: readonly string[] };
}): RouteHandler {
  return (search) => ({ ok: true, epoch: log.epoch(), ...log.since(Number(param(search, 'since') ?? 0) || 0) });
}

export function preflightHandler(preflight: {
  run(options?: { hard?: boolean }): Promise<unknown>;
  snapshot(): unknown;
}): RouteHandler {
  return (search) => {
    void preflight.run({ hard: flag(search, 'hard') });
    return { ok: true, ...(preflight.snapshot() as Record<string, unknown>) };
  };
}

export function capabilityHandler(
  probe: (unit: string | undefined, force: boolean) => Promise<unknown> | unknown,
): RouteHandler {
  return async (search) => {
    const unit = param(search, 'unit');
    const result = await probe(unit, flag(search, 'force'));
    if (result === undefined) {
      return { ok: false, error: { code: 'workbench/unknown-unit', message: `没有这个单元：${unit}` } };
    }
    return { ok: true, ...(result as Record<string, unknown>) };
  };
}

export interface OpencliHealth {
  readonly command: string;
  readonly source: 'env' | 'isolated' | 'path';
  readonly isolated: string | null;
}

export function healthHandler(ctx: DshHostContext, opencli?: OpencliHealth): RouteHandler {
  return () => {
    const profile = ctx.get<{ dir?: string }>('profileContext');
    const dir = profile?.dir;
    return {
      ok: true,
      plugin: PLUGIN_ID,
      profile: dir === undefined ? null : dir.split('/').pop(),
      profileDir: dir ?? null,
      pid: process.pid,
      now: new Date().toISOString(),
      ...(opencli === undefined ? {} : { opencli }),
    };
  };
}

export function registerPrefs(
  ctx: DshHostContext,
  resources: readonly PostResource[],
  wrote?: ((resource: string, write: PostWrite) => void) | undefined,
): () => void {
  return registerPost(ctx, {
    prefix: PREFS_PREFIX,
    what: '偏好写',
    refusedCode: 'write-refused',
    resources,
    ...(wrote === undefined ? {} : { wrote }),
  });
}

export function registerActions(
  ctx: DshHostContext,
  resources: readonly PostResource[],
  wrote?: ((resource: string, write: PostWrite) => void) | undefined,
): () => void {
  return registerPost(ctx, {
    prefix: ACTIONS_PREFIX,
    what: '动作',
    refusedCode: 'action-refused',
    resources,
    ...(wrote === undefined ? {} : { wrote }),
  });
}

export function registerPanelState(ctx: DshHostContext, store: PanelStateStore): () => void {  return registerPost(ctx, {
    prefix: PANEL_STATE_PREFIX,
    what: '面板运行态',
    refusedCode: 'report-refused',
    resources: [
      {
        resource: 'cards',
        handle(payload) {
          const parsed = parseCardsReport(payload);
          if (!parsed.ok) return { ok: false, text: parsed.message };
          store.cards(parsed.value);
          return { ok: true, at: Date.now() };
        },
      },
      {
        resource: 'crash',
        handle(payload) {
          const parsed = parseCrashReport(payload);
          if (!parsed.ok) return { ok: false, text: parsed.message };
          store.crash(parsed.value);
          return { ok: true, at: Date.now() };
        },
      },
    ],
  });
}

export function registerDiyDebugAct(
  ctx: DshHostContext,
  resource: PostResource,
  log?: { bump(facts: readonly string[]): unknown } | undefined,
): () => void {
  return registerPost(ctx, {
    prefix: `${API_PREFIX}/${DIY_DEBUG_PATH}`,
    what: '工作台 DIY 调试动作',
    refusedCode: 'action-refused',
    resources: [resource],
    wrote: () => log?.bump(['diy-debug']),
  });
}

export function registerDiyRecordAct(
  ctx: DshHostContext,
  resource: PostResource,
  log?: { bump(facts: readonly string[]): unknown } | undefined,
): () => void {
  return registerPost(ctx, {
    prefix: `${API_PREFIX}/${DIY_RECORD_PATH}`,
    what: '工作台 DIY 录制交接动作',
    refusedCode: 'action-refused',
    resources: [resource],
    wrote: () => log?.bump(['diy-record']),
  });
}
