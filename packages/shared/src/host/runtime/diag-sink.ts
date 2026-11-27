import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { join } from 'node:path';
import { appendTextFile } from './fs-write.js';
import { now } from './time.js';
import type { DiagHost, DiagRecord, DiagSink } from './diag-records.js';

export const DIAG_RETENTION_DAYS = 7;
export const DIAG_DAY_BYTES = 5 * 1024 * 1024;
export const DIAG_FILE_PREFIX = 'record-';

dayjs.extend(utc);

const SHARD = /^record-(\d{4}-\d{2}-\d{2})-(\d+)(?:-([A-Za-z0-9._-]+))?\.jsonl$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DiagFileSinkOptions {
  readonly dir: string;
  readonly retentionDays?: number | undefined;
  readonly dayBytes?: number | undefined;
  readonly clock?: (() => number) | undefined;
  readonly pid?: number | undefined;
  readonly profile?: string | undefined;
}

export interface DiagReadResult {
  readonly records: readonly DiagRecord[];
  readonly skipped: number;
  readonly read: number;
}

export interface DiagFileSinkStatus {
  readonly capped: boolean;
  readonly path: string;
  readonly bytes: number;
}

export interface DiagFileSink {
  readonly sink: DiagSink;
  readDay(day: string): DiagReadResult;
  cleanup(): number;
  pathOf(day: string): string;
  status(): DiagFileSinkStatus;
}

function dayOf(ts: number): string {
  return dayjs(ts).utc().format('YYYY-MM-DD');
}

function profileOf(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe === '' ? 'unknown' : safe;
}

function shardsIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => SHARD.test(name));
}

export function createDiagFileSink(options: DiagFileSinkOptions): DiagFileSink {
  const retained = options.retentionDays ?? DIAG_RETENTION_DAYS;
  const capBytes = options.dayBytes ?? DIAG_DAY_BYTES;
  const clock = options.clock ?? now;
  const pid = options.pid ?? process.pid;
  const profile = profileOf(options.profile);
  let day = '';
  let path = '';
  let bytes = 0;
  let capped = false;

  const pathOf = (at: string): string =>
    join(
      options.dir,
      `${DIAG_FILE_PREFIX}${at}-${String(pid)}${profile === undefined ? '' : `-${profile}`}.jsonl`,
    );

  const cleanup = (): number => {
    const cutoff = clock() - retained * DAY_MS;
    let removed = 0;
    for (const name of shardsIn(options.dir)) {
      const match = SHARD.exec(name);
      if (match === null || match[1] === undefined) continue;
      const at = Date.parse(`${match[1]}T00:00:00.000Z`);
      if (!Number.isFinite(at) || at >= cutoff) continue;
      unlinkSync(join(options.dir, name));
      removed += 1;
    }
    return removed;
  };

  const rollTo = (at: string): void => {
    if (day === at) return;
    day = at;
    path = pathOf(at);
    bytes = existsSync(path) ? statSync(path).size : 0;
    capped = false;
    cleanup();
  };

  const readDay = (asked: string): DiagReadResult => {
    const names = shardsIn(options.dir).filter((name) => SHARD.exec(name)?.[1] === asked);
    const records: DiagRecord[] = [];
    let skipped = 0;
    let read = 0;
    const noteBroken = (): void => {
      skipped += 1;
    };
    for (const name of names) {
      const match = SHARD.exec(name);
      const fileProfile = match?.[3];
      const filePid = Number.parseInt(match?.[2] ?? '', 10);
      const fallback: DiagHost | undefined =
        fileProfile === undefined || !Number.isInteger(filePid)
          ? undefined
          : { profile: fileProfile, deployment: 'unknown', pid: filePid };
      const text = readFileSync(join(options.dir, name), 'utf8');
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue;
        read += 1;
        try {
          const record = JSON.parse(line) as DiagRecord;
          records.push(
            fallback === undefined || record.host !== undefined ? record : { ...record, host: fallback },
          );
        } catch {
          noteBroken();
        }
      }
    }
    records.sort((left, right) => left.ts - right.ts);
    return { records, skipped, read };
  };

  const sink: DiagSink = (record) => {
    rollTo(dayOf(clock()));
    if (capped) return;
    const line = `${JSON.stringify(record)}\n`;
    const size = Buffer.byteLength(line);
    if (bytes + size > capBytes) {
      capped = true;
      throw new Error(`诊断记录到了当天的上限（${String(capBytes)} 字节），先停止写入：${path}`);
    }
    appendTextFile(path, line);
    bytes += size;
  };

  return { sink, readDay, cleanup, pathOf, status: () => ({ capped, path, bytes }) };
}
