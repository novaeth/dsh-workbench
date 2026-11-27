import { randomUUID } from 'node:crypto';
import { now } from './time.js';
import {
  DIAG_DETAIL_KEYS,
  DIAG_FALLBACK_CODE,
  DIAG_LEVELS,
  diagMatches,
  diagSpecOf,
  type DiagArea,
  type DiagClass,
  type DiagFilter,
  type DiagLevel,
} from '../../contract/blocker.js';

export type { DiagFilter } from '../../contract/blocker.js';

export interface DiagSubject {
  readonly workspace?: string;
  readonly unit?: string;
  readonly route?: string;
  readonly pkg?: string;
}

export interface DiagHost {
  readonly profile: string;
  readonly deployment: 'web' | 'desktop' | 'unknown';
  readonly pid: number;
}

export interface DiagCause {
  readonly code?: string;
  readonly message: string;
  readonly chain?: readonly string[];
}

export type DiagDetailValue = string | number | boolean;

export interface DiagRecord {
  readonly ts: number;
  readonly level: DiagLevel;
  readonly code: string;
  readonly class: DiagClass;
  readonly area: DiagArea;
  readonly subject?: DiagSubject;
  readonly host?: DiagHost;
  readonly corrId: string;
  readonly cause?: DiagCause;
  readonly detail?: Readonly<Record<string, DiagDetailValue>>;
  readonly droppedDetail?: number;
}

export interface DiagInput {
  readonly code: string;
  readonly area?: DiagArea;
  readonly level?: DiagLevel;
  readonly subject?: DiagSubject;
  readonly corrId?: string;
  readonly cause?: DiagCause;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface DiagRecentFilter extends DiagFilter {
  readonly limit?: number;
}

export interface DiagCount {
  readonly count: number;
  readonly at: number;
}

export type DiagSink = (record: DiagRecord) => void;

export interface DiagRecorderOptions {
  readonly clock?: (() => number) | undefined;
  readonly nextCorrId?: (() => string) | undefined;
  readonly cap?: number | undefined;
  readonly sinks?: readonly DiagSink[] | undefined;
  readonly level?: DiagLevel | undefined;
  readonly host?: DiagHost | undefined;
}

export interface DiagSinkStatus {
  readonly ok: boolean;
  readonly error?: string;
  readonly at?: number;
}

export interface DiagRecorder {
  record(input: DiagInput): DiagRecord | null;
  once(key: string, input: DiagInput): DiagRecord | null;
  recent(filter?: DiagRecentFilter): readonly DiagRecord[];
  counts(): ReadonlyMap<string, DiagCount>;
  sinkStatus(): DiagSinkStatus;
  subscribe(listener: (record: DiagRecord) => void): () => void;
}

export const DIAG_RING_CAP = 500;

export const DIAG_SINK_RETRY_MS = 60_000;

const DETAIL_KEYS = new Set(DIAG_DETAIL_KEYS);
const LEVEL_RANK = new Map<DiagLevel, number>(DIAG_LEVELS.map((level, index) => [level, index]));
const FALLBACK = diagSpecOf(DIAG_FALLBACK_CODE);

function levelRank(level: DiagLevel): number {
  return LEVEL_RANK.get(level) ?? 0;
}

function cleanDetail(input: Readonly<Record<string, unknown>> | undefined): {
  readonly detail?: Record<string, DiagDetailValue>;
  readonly dropped: number;
} {
  if (input === undefined) return { dropped: 0 };
  const detail: Record<string, DiagDetailValue> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(input)) {
    const scalar =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    if (!DETAIL_KEYS.has(key) || !scalar) {
      dropped += 1;
      continue;
    }
    detail[key] = value;
  }
  return Object.keys(detail).length === 0 ? { dropped } : { detail, dropped };
}

function defaultLevel(): DiagLevel {
  const asked = process.env['DSH_WB_DIAG_LEVEL']?.trim().toLowerCase();
  if (asked === 'info' || asked === 'warn' || asked === 'error') return asked;
  return process.env['NODE_ENV'] === 'development' ? 'info' : 'warn';
}

export function createDiagRecorder(options: DiagRecorderOptions = {}): DiagRecorder {
  const clock = options.clock ?? now;
  const nextCorrId = options.nextCorrId ?? (() => randomUUID().slice(0, 8));
  const cap = options.cap ?? DIAG_RING_CAP;
  const listeners = new Set<(record: DiagRecord) => void>();
  const sinks = [...(options.sinks ?? [])];
  const sinkErrors = new Map<number, { at: number; retryAt: number; message: string }>();
  const seenOnce = new Set<string>();
  const countsByCode = new Map<string, DiagCount>();
  const ring: DiagRecord[] = [];
  const threshold = options.level ?? defaultLevel();
  const host = options.host;

  const emit = (record: DiagRecord): void => {
    ring.push(record);
    if (ring.length > cap) ring.splice(0, ring.length - cap);
    const seat = countsByCode.get(record.code);
    countsByCode.set(record.code, { count: (seat?.count ?? 0) + 1, at: record.ts });
    for (const listener of [...listeners]) {
      try {
        listener(record);
      } catch (error) {
        listeners.delete(listener);
        process.emitWarning(
          `[dsh-workbench] 诊断记录的订阅者抛错了，已把它移除：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  };

  const record = (input: DiagInput): DiagRecord | null => {
    const level = input.level ?? 'warn';
    if (levelRank(level) < levelRank(threshold)) return null;
    const spec = diagSpecOf(input.code) ?? FALLBACK;
    if (spec === undefined) return null;
    const { detail, dropped } = cleanDetail(input.detail);
    const unknown = diagSpecOf(input.code) === undefined;
    const full: DiagRecord = {
      ts: clock(),
      level,
      code: spec.code,
      class: spec.class,
      area: input.area ?? spec.area,
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      ...(host === undefined ? {} : { host }),
      corrId: input.corrId ?? nextCorrId(),
      cause: unknown
        ? { code: input.code, message: input.cause?.message ?? input.code }
        : (input.cause ?? undefined),
      ...(detail === undefined ? {} : { detail }),
      ...(dropped === 0 ? {} : { droppedDetail: dropped }),
    };
    const clean: DiagRecord = {
      ts: full.ts,
      level: full.level,
      code: full.code,
      class: full.class,
      area: full.area,
      ...(full.subject === undefined ? {} : { subject: full.subject }),
      ...(full.host === undefined ? {} : { host: full.host }),
      corrId: full.corrId,
      ...(full.cause === undefined ? {} : { cause: full.cause }),
      ...(full.detail === undefined ? {} : { detail: full.detail }),
      ...(full.droppedDetail === undefined ? {} : { droppedDetail: full.droppedDetail }),
    };
    emit(clean);
    sinks.forEach((sink, index) => {
      const prior = sinkErrors.get(index);
      if (prior !== undefined && clock() < prior.retryAt) return;
      try {
        sink(clean);
        sinkErrors.delete(index);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const at = clock();
        sinkErrors.set(index, { at, retryAt: at + DIAG_SINK_RETRY_MS, message });
        if (prior?.message === message) return;
        emit({
          ts: at,
          level: 'error',
          code: 'DIAG_SINK_FAILED',
          class: 'bug',
          area: 'diag',
          corrId: clean.corrId,
          ...(host === undefined ? {} : { host }),
          cause: { message },
          detail: { sink: index },
        });
      }
    });
    return clean;
  };

  return {
    record,
    once(key, input) {
      if (seenOnce.has(key)) return null;
      const made = record(input);
      if (made !== null) seenOnce.add(key);
      return made;
    },
    recent(filter = {}) {
      const hit = ring.filter((one) => diagMatches(one, filter));
      const limit = filter.limit ?? hit.length;
      return hit.slice(Math.max(0, hit.length - limit));
    },
    counts: () => new Map(countsByCode),
    sinkStatus() {
      const latest = [...sinkErrors.values()].sort((left, right) => right.at - left.at)[0];
      return latest === undefined ? { ok: true } : { ok: false, error: latest.message, at: latest.at };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
