import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { DiagReadResult, DiagRecord, DshHostContext, DshToolDefinition } from '@dsh-workbench/shared/host';
import { diagMatches, diagSummary, now, originsOf, UNITS_SERVICE, workbenchRoot } from '@dsh-workbench/shared/host';
import { diagHostOf, diagRoutesOf } from '@/shared/api/host/diag-routes';
import { refusalRowsOf, type UnitRefusalRow } from '@/shared/api/host/unit-refusals';
import { preflightEvidenceOf, readPreflightSnapshot } from '@/shared/api/host/diag-preflight';
import { OUTPUT } from './diy-context';
import { toolRegistryOf } from './tool-registry-guard';
import { DIAG_TOOL } from '../unit';

dayjs.extend(utc);

export const DIAG_HISTORY_LIMIT = 20;

export const DIAG_RECENT_WINDOW_MS = 30 * 60 * 1000;

const DIAG_RECENT_LIMIT = 10;

const DIAG_DESCRIPTION =
  '读取最近的故障记录、按故障码的计数与启动检查快照（只读）。启动页停住时先调它；history 是跨会话的磁盘记录。默认只读当前工作台；host 可指定另一份工作台，* 为全部。corrId 精确取一条；code / since / windowMs 缩小范围；headline 是最近一条失败。';

const textParamOf = (description: string): { readonly type: 'string'; readonly description: string } => ({
  type: 'string',
  description,
});

const numberParamOf = (description: string): { readonly type: 'number'; readonly description: string } => ({
  type: 'number',
  description,
});

const DIAG_INPUT = {
  type: 'object',
  properties: {
    host: textParamOf('读取哪份工作台的记录；不填 = 当前工作台，* = 全部，其他值见返回的 hosts。'),
    corrId: textParamOf('要精确取的那条记录的关联号；界面「复制给 agent」里带的就是它。'),
    code: textParamOf('只看这个故障码。'),
    since: numberParamOf('只看这个毫秒时间戳之后的记录。'),
    windowMs: numberParamOf('recent 回看多久，默认 30 分钟。'),
  },
  additionalProperties: false,
} as const;

interface DiagQuery {
  readonly host?: string;
  readonly corrId?: string;
  readonly code?: string;
  readonly since?: number;
  readonly windowMs: number;
}

export interface DiagHistory {
  readonly records: readonly DiagRecord[];
  readonly read: number;
  readonly skipped: number;
  readonly truncated: boolean;
}

function recordKey(record: DiagRecord): string {
  return `${record.ts}|${record.code}|${record.corrId}`;
}

export function diagHistoryOf(
  memory: readonly DiagRecord[],
  disk: DiagReadResult | undefined,
  limit = DIAG_HISTORY_LIMIT,
  host?: string,
): DiagHistory | undefined {
  if (disk === undefined) return undefined;
  const seen = new Set(memory.map(recordKey));
  const fresh = disk.records.filter(
    (record) => !seen.has(recordKey(record)) && diagMatches(record, host === undefined ? {} : { host }),
  );
  return {
    records: fresh.slice(Math.max(0, fresh.length - limit)),
    read: disk.read,
    skipped: disk.skipped,
    truncated: fresh.length > limit,
  };
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function numberOr(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function queryOf(raw: unknown): DiagQuery {
  const box = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const host = textOf(box['host']);
  const corrId = textOf(box['corrId']);
  const code = textOf(box['code']);
  const since = numberOr(box['since']);
  const windowMs = numberOr(box['windowMs']);
  return {
    ...(host === undefined ? {} : { host }),
    ...(corrId === undefined ? {} : { corrId }),
    ...(code === undefined ? {} : { code }),
    ...(since === undefined ? {} : { since }),
    windowMs: windowMs === undefined || windowMs <= 0 ? DIAG_RECENT_WINDOW_MS : windowMs,
  };
}

function matchOf(record: DiagRecord, query: DiagQuery): boolean {
  if (query.corrId !== undefined && record.corrId !== query.corrId) return false;
  if (query.code !== undefined && record.code !== query.code) return false;
  if (query.since !== undefined && record.ts < query.since) return false;
  return true;
}

function headlineOf(records: readonly DiagRecord[], at: number): Record<string, unknown> | null {
  const hit = [...records].reverse().find((one) => one.level !== 'info');
  if (hit === undefined) return null;
  return {
    code: hit.code,
    level: hit.level,
    class: hit.class,
    area: hit.area,
    at: hit.ts,
    ageMs: Math.max(0, at - hit.ts),
    corrId: hit.corrId,
    ...(hit.subject?.route === undefined ? {} : { route: hit.subject.route }),
    ...(hit.cause === undefined ? {} : { cause: hit.cause }),
    ...(hit.detail === undefined ? {} : { detail: hit.detail }),
  };
}

function recentOf(records: readonly DiagRecord[], windowMs: number, at: number): readonly DiagRecord[] {
  const within = records.filter((one) => one.ts >= at - windowMs);
  return within.slice(Math.max(0, within.length - DIAG_RECENT_LIMIT)).reverse();
}

function mergedOf(ring: readonly DiagRecord[], history: DiagHistory | undefined, withRing: boolean): DiagRecord[] {
  const base = withRing ? [...ring, ...(history?.records ?? [])] : [...(history?.records ?? [])];
  return base.sort((left, right) => left.ts - right.ts);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerDiagTools(ctx: DshHostContext): Array<() => void> {
  const tools = toolRegistryOf(ctx, '跳过诊断工具注册');
  if (tools === undefined) return [];
  const tool: DshToolDefinition = {
    name: DIAG_TOOL,
    description: DIAG_DESCRIPTION,
    parameters: { ...DIAG_INPUT },
    output: OUTPUT,
    execute(raw: unknown) {
      const routes = diagRoutesOf(workbenchRoot(), diagHostOf(ctx));
      const current = routes.host?.profile ?? 'unknown';
      const asked = queryOf(raw);
      const view = asked.host === undefined || asked.host === current ? 'current' : asked.host === '*' ? 'all' : 'other';
      const summary = diagSummary(routes.recorder);
      const ring = routes.recorder.recent();
      const day = dayjs().utc().format('YYYY-MM-DD');
      const at = now();
      const wide = asked.corrId !== undefined || asked.code !== undefined || asked.since !== undefined;
      let disk: DiagReadResult | undefined;
      let diskState: 'ok' | 'unavailable' = 'unavailable';
      let diskError: string | undefined;
      try {
        disk = routes.readDisk?.(day);
        if (disk !== undefined) diskState = 'ok';
      } catch (error) {
        diskError = messageOf(error);
        ctx.logger?.warn?.(`[dsh-workbench] 读诊断记录失败：${diskError}`);
      }
      const historyHost = view === 'current' ? current : asked.host;
      const history = disk === undefined
        ? undefined
        : diagHistoryOf(
            view === 'other' ? [] : summary.records,
            disk,
            wide ? 500 : DIAG_HISTORY_LIMIT,
            historyHost,
          );
      const hosts = [...new Set([current, ...originsOf(disk?.records ?? []).map((one) => one.host)])].sort();
      const root = workbenchRoot();
      let preflight: ReturnType<typeof preflightEvidenceOf> = null;
      let preflightError: string | undefined;
      try {
        preflight = preflightEvidenceOf(readPreflightSnapshot(root), root);
      } catch (error) {
        preflightError = messageOf(error);
        ctx.logger?.warn?.(`[dsh-workbench] 读启动检查快照失败：${preflightError}`);
      }
      const units = ctx.get(UNITS_SERVICE) as { refusals(): readonly UnitRefusalRow[] } | undefined;
      let refusals: UnitRefusalRow[] = [];
      let refusalsError: string | undefined;
      try {
        refusals = units === undefined ? [] : refusalRowsOf(units);
      } catch (error) {
        refusalsError = messageOf(error);
        ctx.logger?.warn?.(`[dsh-workbench] 读模块拒收失败：${refusalsError}`);
      }
      const all = mergedOf(ring, history, view !== 'other');
      const matching = all.filter((one) => matchOf(one, asked));
      const records = asked.corrId === undefined
        ? summary.records.filter((one) => matchOf(one, asked))
        : matching.slice(Math.max(0, matching.length - 50));
      const truncated = {
        memory: ring.length > summary.records.length,
        history: history?.truncated ?? false,
      };
      const sink = {
        ...routes.recorder.sinkStatus(),
        ...(routes.sink === undefined ? {} : { file: routes.sink.status() }),
      };
      const problems = [
        ['diskError', diskError],
        ['preflightError', preflightError],
        ['refusalsError', refusalsError],
      ] as const;
      const base = {
        view,
        host: current,
        disk: diskState,
        hosts,
        sink,
        ...Object.fromEntries(problems.filter(([, value]) => value !== undefined)),
        ...(refusals.length === 0 ? {} : { refusals }),
        preflight,
        headline: headlineOf(matching, at),
        recent: recentOf(matching, asked.windowMs, at),
        truncated,
      };
      const output =
        view === 'current'
          ? {
              ...base,
              counts: summary.counts,
              shown: records.length,
              records,
              others: originsOf(disk?.records ?? [], current),
              ...(history === undefined ? {} : { history: { day, ...history } }),
            }
          : view === 'all'
            ? {
                ...base,
                countsByHost: originsOf(disk?.records ?? [], current),
                ...(history === undefined ? {} : { history: { day, ...history } }),
              }
            : {
                ...base,
                ...(history === undefined ? {} : { history: { day, ...history } }),
              };
      return Promise.resolve(output);
    },
  };
  return [tools.register(tool)];
}
