import { now, nowIso } from './time.js';
import type { DshHostContext, DshRequest, DshResponse } from '../../api/dsh.js';
import { unitFactScope } from '../unit/facts.js';
import { parseCardsReport, parseCrashReport, type PanelStateStore } from '../unit/panel-state.js';
import { ACTIONS_PREFIX, API_PREFIX, DIY_DEBUG_PATH, DIY_RECORD_PATH, PANEL_STATE_PREFIX, PLUGIN_ID, PREFS_PREFIX, PROVISION_PREFIX } from '../../config/constants.js';
import {
  parseProvisionBody,
  provisionTargetOf,
  type ProvisionHandler,
  type ProvisionRequest,
} from '../supply/provision.js';
import type { RuntimeStatus } from '../adapters/adapter-types.js';
import type { DiagArea } from '../../contract/blocker.js';
import { WorkbenchDataError } from '../data/data-error.js';
import { writeResultForClient } from './write-result.js';
import type { DiagRecorder } from './diag-records.js';
import { firstLineOfText } from './diag-text.js';

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
      ...(data.failure === undefined ? {} : { failure: data.failure }), ...(data.pendingBuilds === undefined ? {} : { pendingBuilds: data.pendingBuilds }),
    };
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error) };
}

const DIAG_FAILURE_WINDOW_MS = 10 * 60 * 1000;

const DIAG_AREA_OF: Readonly<Record<string, DiagArea>> = {
  panels: 'panels',
  market: 'market',
  discover: 'market',
  supply: 'supply',
  modules: 'supply',
  settings: 'settings',
  'config-sync': 'settings',
  profile: 'settings',
  preflight: 'preflight',
  'self-update': 'self-update',
};

function diagAreaOf(route: string): DiagArea {
  const head = route.split('/')[0] ?? '';
  return DIAG_AREA_OF[head] ?? DIAG_AREA_OF[head.split('-')[0] ?? ''] ?? 'diag';
}

function failureOf(value: unknown): { readonly code: string; readonly message: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const box = value as { readonly ok?: unknown; readonly error?: unknown };
  if (box.ok !== false) return undefined;
  const error = typeof box.error === 'object' && box.error !== null
    ? box.error as { readonly code?: unknown; readonly message?: unknown }
    : {};
  return {
    code: typeof error.code === 'string' && error.code !== '' ? error.code : 'failed',
    message: typeof error.message === 'string' ? error.message : '',
  };
}

function diagCorrIdOf(
  diag: DiagRecorder | undefined,
  input: {
    readonly route: string;
    readonly unit?: string;
    readonly area: DiagArea;
    readonly code: string;
    readonly failure: { readonly code: string; readonly message: string };
  },
): string | undefined {
  if (diag === undefined) return undefined;
  const at = now();
  const existing = diag.recent({ since: at - DIAG_FAILURE_WINDOW_MS, area: input.area })
    .find((one) => one.subject?.route === input.route && one.code === input.code);
  if (existing !== undefined) return existing.corrId;
  const made = diag.record({
    code: input.code,
    area: input.area,
    subject: { route: input.route, ...(input.unit === undefined ? {} : { unit: input.unit }) },
    cause: {
      ...(input.failure.code === '' ? {} : { code: input.failure.code }),
      message: firstLineOfText(input.failure.message) || '这一步没有成功，也没说为什么',
    },
  });
  return made?.corrId;
}

function withDiagCorrId(value: unknown, corrId: string | undefined): unknown {
  if (corrId === undefined || typeof value !== 'object' || value === null) return value;
  return { ...(value as Record<string, unknown>), diag: { corrId } };
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

export function registerApi(ctx: DshHostContext, routes: RouteTable, diag?: DiagRecorder): () => void {
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
        const result = await handler(search);
        const failure = failureOf(result);
        const corrId = failure === undefined
          ? undefined
          : diagCorrIdOf(diag, { route, area: diagAreaOf(route), code: 'READ_FAILED', failure });
        sendJson(res, 200, withDiagCorrId(result, corrId));
      } catch (error) {
        const payload = toErrorPayload(error);
        const corrId = diagCorrIdOf(diag, {
          route,
          area: diagAreaOf(route),
          code: 'READ_FAILED',
          failure: { code: String(payload['code'] ?? 'internal'), message: String(payload['message'] ?? '') },
        });
        if (isDataError(error)) {
          sendJson(res, 200, withDiagCorrId({ ok: false, error: payload }, corrId));
          return;
        }
        ctx.logger?.warn?.(`[dsh-workbench] 路由 ${route} 失败：${String(error)}`);
        sendJson(res, 500, withDiagCorrId({ ok: false, error: payload }, corrId));
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
        const target = request[provisionTargetOf(request.action)] ?? '';
        ctx.logger?.warn?.(
          `[dsh-workbench] provision ${request.action} ${target} 失败：${error instanceof Error ? error.message : String(error)}`,
        );
        sendJson(res, 200, { ok: false, error: toErrorPayload(error) });
      }
    },
  });
}

export interface PostResource {
  readonly resource: string;
  readonly unit?: string;
  readonly redact?: boolean | undefined;
  handle(payload: unknown): Promise<unknown> | unknown;
}

export interface PostWrite {
  readonly args?: unknown;
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
    readonly diag?: DiagRecorder | undefined;
  },
): () => void {
  const { prefix, what, resources, refusedCode, wrote, diag } = options;
  const table = new Map(resources.map((item) => [item.resource, item] as const));
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
      const resource = table.get(requested);
      if (resource === undefined) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `没有这个${what}资源：${requested}` } });
        return;
      }
      try {
        const result = await resource.handle(payload);
        wrote?.(requested, { ...(resource.redact === true ? {} : { args: payload }), result });
        const body = writeResultForClient(result, refusedCode);
        const failure = failureOf(body);
        const corrId = failure === undefined
          ? undefined
          : diagCorrIdOf(diag, {
              route: requested,
              ...(resource.unit === undefined ? {} : { unit: resource.unit }),
              area: diagAreaOf(requested),
              code: 'ACTION_FAILED',
              failure,
            });
        sendJson(res, 200, withDiagCorrId(body, corrId));
      } catch (error) {
        const payloadError = toErrorPayload(error);
        ctx.logger?.warn?.(`[dsh-workbench] ${requested} 失败：${String(error)}`);
        const corrId = diagCorrIdOf(diag, {
          route: requested,
          ...(resource.unit === undefined ? {} : { unit: resource.unit }),
          area: diagAreaOf(requested),
          code: 'ACTION_FAILED',
          failure: { code: String(payloadError['code'] ?? 'internal'), message: String(payloadError['message'] ?? '') },
        });
        sendJson(res, 200, withDiagCorrId({ ok: false, error: payloadError }, corrId));
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
  run(options?: { hard?: boolean; only?: string }): Promise<unknown>;
  snapshot(): unknown;
}): RouteHandler {
  return (search) => {
    if (flag(search, 'hard')) {
      void preflight.run({ hard: true });
      return { ok: true, ...(preflight.snapshot() as Record<string, unknown>) };
    }
    const only = param(search, 'only');
    if (only !== undefined && only !== '') {
      void preflight.run({ only });
      return { ok: true, ...(preflight.snapshot() as Record<string, unknown>) };
    }
    const snapshot = preflight.snapshot() as Record<string, unknown>;
    void preflight.run({ hard: false });
    return { ok: true, ...snapshot };
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

export function healthHandler(
  ctx: DshHostContext,
  runtimes?: Readonly<Record<string, RuntimeStatus>>,
): RouteHandler {
  return () => {
    const profile = ctx.get('profileContext');
    const dir = profile?.dir;
    return {
      ok: true,
      plugin: PLUGIN_ID,
      profile: dir === undefined ? null : dir.split('/').pop(),
      profileDir: dir ?? null,
      pid: process.pid,
      now: nowIso(),
      ...(runtimes === undefined ? {} : { runtimes }),
    };
  };
}

const channelOf = (prefix: string, what: string, refusedCode: string) =>
  (
    ctx: DshHostContext,
    resources: readonly PostResource[],
    wrote?: ((resource: string, write: PostWrite) => void) | undefined,
    diag?: DiagRecorder | undefined,
  ): (() => void) => registerPost(ctx, { prefix, what, refusedCode, resources, wrote, diag });

export const registerPrefs = channelOf(PREFS_PREFIX, '偏好写', 'write-refused');

export const registerActions = channelOf(ACTIONS_PREFIX, '动作', 'action-refused');

function reportResource<T>(
  resource: string,
  parse: (payload: unknown) => { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string },
  apply: (value: T) => void,
): PostResource {
  return {
    resource,
    handle(payload) {
      const parsed = parse(payload);
      if (!parsed.ok) return { ok: false, text: parsed.message };
      apply(parsed.value);
      return { ok: true, at: now() };
    },
  };
}

export function registerPanelState(ctx: DshHostContext, store: PanelStateStore, diag?: DiagRecorder): () => void {
  return registerPost(ctx, { prefix: PANEL_STATE_PREFIX, what: '面板运行态', refusedCode: 'report-refused', wrote: undefined, diag, resources: [
      reportResource('cards', parseCardsReport, (value) => store.cards(value)),
      reportResource('crash', parseCrashReport, (value) => store.crash(value)),
    ],
  });
}

function registerDiyAct(
  ctx: DshHostContext,
  options: {
    readonly prefix: string;
    readonly what: string;
    readonly resource: PostResource;
    readonly fact: string;
    readonly log: { bump(facts: readonly string[]): unknown } | undefined;
    readonly diag: DiagRecorder | undefined;
  },
): () => void {
  return registerPost(ctx, { prefix: `${API_PREFIX}/${options.prefix}`, what: options.what, refusedCode: 'action-refused', resources: [options.resource], wrote: () => options.log?.bump([options.fact]), diag: options.diag });
}

type DiyLog = { bump(facts: readonly string[]): unknown };

export function registerDiyDebugAct(
  ctx: DshHostContext,
  resource: PostResource,
  log?: DiyLog,
  diag?: DiagRecorder,
): () => void {
  return registerDiyAct(ctx, { prefix: DIY_DEBUG_PATH, what: '工作台 DIY 调试动作', resource, fact: 'diy-debug', log, diag });
}

export const registerDiyRecordAct = (ctx: DshHostContext, resource: PostResource, log?: DiyLog, diag?: DiagRecorder): (() => void) =>
  registerDiyAct(ctx, { prefix: DIY_RECORD_PATH, what: '工作台 DIY 录制交接动作', resource, fact: 'diy-record', log, diag });
