import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { basename, join } from 'node:path';
import type { DiagFileSink, DiagHost, DiagRecorder, DiagReadResult, DshHostContext, RouteHandler } from '@dsh-workbench/shared/host';
import { createDiagFileSink, createDiagRecorder, hostSurface, now, originsOf } from '@dsh-workbench/shared/host';
import { DIAG_AREAS, DIAG_CLASSES, diagMatches, param } from '@dsh-workbench/shared/host';
import type { DiagArea, DiagClass } from '@dsh-workbench/shared/host';
dayjs.extend(utc);

export const DIAG_RECORDS_ROUTE = 'diag/records';

export const DIAG_LIMIT_DEFAULT = 100;
export const DIAG_LIMIT_MAX = 500;

export interface DiagRoutesDeps {
  readonly recorder: DiagRecorder;
  readonly sink?: DiagFileSink | undefined;
  readonly dirOf?: (() => string | null) | undefined;
  readonly readDisk?: ((day: string) => DiagReadResult) | undefined;
  readonly clock?: (() => number) | undefined;
  readonly host?: DiagHost | undefined;
}

export function diagHostOf(ctx: DshHostContext): DiagHost {
  const dir = (ctx.get('profileContext') as { readonly dir?: string } | undefined)?.dir;
  const profile = typeof dir === 'string' && dir.trim() !== '' ? basename(dir.trim()) : 'unknown';
  return { profile, deployment: hostSurface().deployment, pid: process.pid };
}

interface DiagQuery {
  readonly since?: number;
  readonly until?: number;
  readonly area?: DiagArea;
  readonly class?: DiagClass;
  readonly code?: string;
  readonly host?: string;
  readonly limit: number;
  readonly source: 'memory' | 'disk';
}

function badRequest(message: string): { readonly ok: false; readonly error: { readonly code: string; readonly message: string } } {
  return { ok: false, error: { code: 'bad-request', message } };
}

function numberParam(raw: string | undefined): number | undefined | 'bad' {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 'bad';
}

function queryOf(search: URLSearchParams): DiagQuery | string {
  const since = numberParam(param(search, 'since'));
  if (since === 'bad') return 'since 必须是毫秒时间戳';
  const until = numberParam(param(search, 'until'));
  if (until === 'bad') return 'until 必须是毫秒时间戳';
  const area = param(search, 'area');
  if (area !== undefined && !(DIAG_AREAS as readonly string[]).includes(area)) {
    return `area 只能是 ${DIAG_AREAS.join(' / ')}`;
  }
  const kind = param(search, 'class');
  if (kind !== undefined && !(DIAG_CLASSES as readonly string[]).includes(kind)) {
    return `class 只能是 ${DIAG_CLASSES.join(' / ')}`;
  }
  const limitRaw = numberParam(param(search, 'limit'));
  if (limitRaw === 'bad') return 'limit 必须是数字';
  const limit = Math.min(Math.max(1, Math.floor(limitRaw ?? DIAG_LIMIT_DEFAULT)), DIAG_LIMIT_MAX);
  const source = param(search, 'source');
  if (source !== undefined && source !== 'memory' && source !== 'disk') return 'source 只能是 memory / disk';
  const code = param(search, 'code');
  const host = param(search, 'host');
  return {
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    ...(area === undefined ? {} : { area: area as DiagArea }),
    ...(kind === undefined ? {} : { class: kind as DiagClass }),
    ...(code === undefined ? {} : { code }),
    ...(host === undefined ? {} : { host }),
    limit,
    source: source === 'disk' ? 'disk' : 'memory',
  };
}

export function diagRecordsHandler(deps: DiagRoutesDeps): RouteHandler {
  const clock = deps.clock ?? now;
  const dirOf = deps.dirOf ?? (() => null);
  const current = deps.host?.profile ?? 'unknown';
  return (search) => {
    const query = queryOf(search);
    if (typeof query === 'string') {
      deps.recorder.record({ code: 'DIAG_BAD_PARAM', cause: { message: query } });
      return badRequest(query);
    }
    if (query.source === 'memory' && query.host !== undefined && query.host !== current) {
      const message = '内存记录只包含当前工作台；读取其他工作台需使用 source=disk';
      deps.recorder.record({ code: 'DIAG_BAD_PARAM', cause: { message } });
      return badRequest(message);
    }
    if (query.source === 'disk' && deps.readDisk === undefined) {
      const message = '这份工作台没有接通磁盘记录，只能使用 source=memory';
      deps.recorder.record({ code: 'DIAG_BAD_PARAM', cause: { message } });
      return badRequest(message);
    }
    const disk = query.source === 'disk'
      ? (deps.readDisk as (day: string) => DiagReadResult)(dayjs(clock()).utc().format('YYYY-MM-DD')).records
      : undefined;
    const all = disk ?? deps.recorder.recent();
    const hit = all.filter((one) => diagMatches(one, { ...query, host: query.host ?? current }));
    const records = hit.slice(Math.max(0, hit.length - query.limit));
    const hosts = disk === undefined
      ? [current]
      : [...new Set([current, ...originsOf(disk).map((one) => one.host)])].sort();
    return {
      ok: true,
      records,
      total: hit.length,
      truncated: hit.length > records.length,
      host: {
        node: process.versions.node,
        profile: current,
        profileDir: dirOf(),
        deployment: deps.host?.deployment ?? 'unknown',
        pid: deps.host?.pid ?? process.pid,
      },
      hosts,
      counts: [...deps.recorder.counts().entries()].map(([code, one]) => ({ code, count: one.count, at: one.at })),
    };
  };
}

const BY_ROOT = new Map<string, DiagRoutesDeps>();

export function diagRoutesOf(root: string, host?: DiagHost): DiagRoutesDeps {
  const effective: DiagHost = host ?? { profile: 'unknown', deployment: 'unknown', pid: process.pid };
  const hit = BY_ROOT.get(root);
  if (hit !== undefined) return hit;
  const files = createDiagFileSink({ dir: join(root, 'diagnostics', 'records'), profile: effective.profile });
  const made: DiagRoutesDeps = {
    recorder: createDiagRecorder({ sinks: [files.sink], host: effective }),
    readDisk: (day) => files.readDay(day),
    host: effective,
    sink: files,
  };
  BY_ROOT.set(root, made);
  return made;
}
