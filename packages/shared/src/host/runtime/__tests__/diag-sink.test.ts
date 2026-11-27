import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDiagFileSink } from '../diag-sink.js';
import { createDiagRecorder } from '../diag-records.js';
import type { DiagRecord } from '../diag-records.js';

let dir = '';

function recordAt(ts: number, code = 'READ_FAILED'): DiagRecord {
  return { ts, level: 'warn', code, class: 'env', area: 'panels', corrId: 'c-1' };
}

function clockAt(start: number): () => number {
  const now = start;
  return () => now;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-diag-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('诊断记录的落盘 sink', () => {
  it('★ 分片名带日期与进程号；写进去能按天读回来', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const sink = createDiagFileSink({ dir, clock, pid: 4242 });

    sink.sink(recordAt(clock(), 'READ_FAILED'));
    sink.sink(recordAt(clock(), 'CONFIG_CORRUPT'));

    expect(sink.pathOf('2026-11-21')).toBe(path.join(dir, 'record-2026-11-21-4242.jsonl'));
    const read = sink.readDay('2026-11-21');
    expect(read.read).toBe(2);
    expect(read.skipped).toBe(0);
    expect(read.records.map((one) => one.code)).toEqual(['READ_FAILED', 'CONFIG_CORRUPT']);
  });

  it('★ 跨天换分片：昨天的文件不动，今天写新文件', () => {
    let now = Date.parse('2026-11-21T23:59:00.000Z');
    const clock = () => now;
    const sink = createDiagFileSink({ dir, clock, pid: 7 });

    sink.sink(recordAt(now));
    now = Date.parse('2026-11-22T00:01:00.000Z');
    sink.sink(recordAt(now));

    expect(fs.existsSync(sink.pathOf('2026-11-21'))).toBe(true);
    expect(fs.existsSync(sink.pathOf('2026-11-22'))).toBe(true);
    expect(sink.readDay('2026-11-21').records).toHaveLength(1);
    expect(sink.readDay('2026-11-22').records).toHaveLength(1);
  });

  it('★ 过期分片在换天时被清掉，没到期的留着', () => {
    const old = path.join(dir, 'record-2026-11-01-9.jsonl');
    const fresh = path.join(dir, 'record-2026-11-20-9.jsonl');
    fs.writeFileSync(old, `${JSON.stringify(recordAt(1))}\n`, 'utf8');
    fs.writeFileSync(fresh, `${JSON.stringify(recordAt(2))}\n`, 'utf8');
    const sink = createDiagFileSink({
      dir,
      clock: clockAt(Date.parse('2026-11-21T12:00:00.000Z')),
      pid: 9,
      retentionDays: 7,
    });

    sink.sink(recordAt(Date.parse('2026-11-21T12:00:00.000Z')));

    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('★ 到当天上限：第一次抛（让记录器记一条），之后不再写也不再抛', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const sink = createDiagFileSink({ dir, clock, pid: 1, dayBytes: 40 });

    expect(() => sink.sink(recordAt(clock()))).toThrowError(/上限/);
    expect(() => sink.sink(recordAt(clock()))).not.toThrow();
    expect(sink.readDay('2026-11-21').records).toHaveLength(0);
  });

  it('★ status 报出当天是否到上限', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const sink = createDiagFileSink({ dir, clock, pid: 1, dayBytes: 40 });

    expect(sink.status()).toMatchObject({ capped: false, bytes: 0 });
    expect(() => sink.sink(recordAt(clock()))).toThrowError(/上限/);
    expect(sink.status().capped).toBe(true);
  });


  it('★ 半写入的坏行跳过并计数，好的照样读回来', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const sink = createDiagFileSink({ dir, clock, pid: 3 });
    sink.sink(recordAt(clock()));
    fs.appendFileSync(sink.pathOf('2026-11-21'), '{"ts": 1, "level": "w', 'utf8');

    const read = sink.readDay('2026-11-21');

    expect(read.records).toHaveLength(1);
    expect(read.skipped).toBe(1);
    expect(read.read).toBe(2);
  });

  it('★ 同一天多个进程的分片合并读回，按时间正序', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const first = createDiagFileSink({ dir, clock, pid: 11 });
    const second = createDiagFileSink({ dir, clock, pid: 22 });
    first.sink(recordAt(30));
    second.sink(recordAt(10));
    second.sink(recordAt(20));

    expect(first.readDay('2026-11-21').records.map((one) => one.ts)).toEqual([10, 20, 30]);
  });

  it('★ 记录器 + 落盘：写失败被记成 DIAG_SINK_FAILED，且只记一次', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const files = createDiagFileSink({ dir, clock, pid: 5, dayBytes: 40 });
    const recorder = createDiagRecorder({ clock, nextCorrId: () => 'c-1', sinks: [files.sink] });

    recorder.record({ code: 'READ_FAILED' });
    recorder.record({ code: 'READ_FAILED' });

    expect(files.readDay('2026-11-21').records).toHaveLength(0);
    expect(recorder.recent({ code: 'DIAG_SINK_FAILED' })).toHaveLength(1);
    expect(recorder.recent({ code: 'READ_FAILED' })).toHaveLength(2);
  });

  it('记录器写进去的记录，读回来与内存里的一致（形状不漂）', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const files = createDiagFileSink({ dir, clock, pid: 6 });
    const recorder = createDiagRecorder({ clock, nextCorrId: () => 'c-9', sinks: [files.sink] });

    const written = recorder.record({ code: 'MODULE_UNREADABLE', detail: { pkg: '@acme/x' } });
    const read = files.readDay('2026-11-21').records[0];

    expect(read).toEqual(written);
  });

  it('★ 分片名带宿主 profile；读回给缺 host 的记录补上', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const sink = createDiagFileSink({ dir, clock, pid: 4242, profile: 'web' });

    expect(sink.pathOf('2026-11-21')).toBe(path.join(dir, 'record-2026-11-21-4242-web.jsonl'));
    sink.sink(recordAt(clock()));

    expect(sink.readDay('2026-11-21').records[0]?.host).toEqual({
      profile: 'web',
      deployment: 'unknown',
      pid: 4242,
    });
  });

  it('旧三段分片仍能读，且不硬补宿主', () => {
    const clock = clockAt(Date.parse('2026-11-21T10:00:00.000Z'));
    const sink = createDiagFileSink({ dir, clock, pid: 7 });

    sink.sink(recordAt(clock()));

    expect(sink.pathOf('2026-11-21')).toBe(path.join(dir, 'record-2026-11-21-7.jsonl'));
    expect(sink.readDay('2026-11-21').records[0]?.host).toBeUndefined();
  });

  it('清理同时认旧名与新名，profile 做安全字符替换', () => {
    const old = path.join(dir, 'record-2026-11-01-9-web.jsonl');
    const fresh = path.join(dir, 'record-2026-11-20-9-web.jsonl');
    fs.writeFileSync(old, `${JSON.stringify(recordAt(1))}\n`, 'utf8');
    fs.writeFileSync(fresh, `${JSON.stringify(recordAt(2))}\n`, 'utf8');
    const sink = createDiagFileSink({
      dir,
      clock: clockAt(Date.parse('2026-11-21T12:00:00.000Z')),
      pid: 9,
      profile: 'a/b',
      retentionDays: 7,
    });

    expect(sink.pathOf('2026-11-21')).toBe(path.join(dir, 'record-2026-11-21-9-a_b.jsonl'));
    expect(sink.cleanup()).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('没有目录 / 没有分片时读回是空的，不抛', () => {
    const sink = createDiagFileSink({ dir: path.join(dir, 'missing'), pid: 1 });
    expect(sink.readDay('2026-11-21')).toEqual({ records: [], skipped: 0, read: 0 });
    expect(sink.cleanup()).toBe(0);
  });
});
