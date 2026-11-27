import { describe, expect, it, vi } from 'vitest';
import { createDiagRecorder, DIAG_SINK_RETRY_MS, type DiagHost, type DiagRecord } from '../diag-records.js';

function fixedClock(): () => number {
  let now = 1_000;
  return () => {
    now += 10;
    return now;
  };
}

function recorderOf(extra: Parameters<typeof createDiagRecorder>[0] = {}) {
  return createDiagRecorder({ clock: fixedClock(), nextCorrId: () => 'c-1', ...extra });
}

describe('诊断记录器', () => {
  it('★ 落一条记录：补全时间、关联号，类别与区域取自注册表', () => {
    const recorder = recorderOf();
    const record = recorder.record({ code: 'READ_FAILED', subject: { route: 'panels' } });

    expect(record).toMatchObject({
      code: 'READ_FAILED',
      class: 'env',
      area: 'panels',
      corrId: 'c-1',
      subject: { route: 'panels' },
      level: 'warn',
    });
    expect(recorder.recent()).toHaveLength(1);
  });

  it('★ 表外码降级为兜底码，并把原码留在原因里（不丢线索）', () => {
    const recorder = recorderOf();
    const record = recorder.record({ code: 'NOT_REGISTERED' });

    expect(record?.code).toBe('DIAG_UNKNOWN_CODE');
    expect(record?.class).toBe('bug');
    expect(record?.cause?.code).toBe('NOT_REGISTERED');
  });

  it('★ detail 只收白名单键与标量：越界键与嵌套值被丢弃并计数', () => {
    const recorder = recorderOf();
    const record = recorder.record({
      code: 'READ_FAILED',
      detail: { route: 'panels', count: 2, truncated: true, secret: 'x', nested: { a: 1 } },
    });

    expect(record?.detail).toEqual({ route: 'panels', count: 2, truncated: true });
    expect(record?.droppedDetail).toBe(2);
  });

  it('环形缓冲按容量淘汰最旧，recent 按时间正序返回', () => {
    const recorder = recorderOf({ cap: 3 });
    for (let at = 0; at < 5; at += 1) recorder.record({ code: 'READ_FAILED', detail: { attempt: at } });

    const kept = recorder.recent();
    expect(kept.map((one) => one.detail?.['attempt'])).toEqual([2, 3, 4]);
  });

  it('★ 过滤：时间下限、区域、类别、码、条数上限', () => {
    const recorder = recorderOf();
    recorder.record({ code: 'READ_FAILED' });
    recorder.record({ code: 'CONFIG_CORRUPT' });
    recorder.record({ code: 'READ_FAILED' });

    expect(recorder.recent({ area: 'settings' }).map((one) => one.code)).toEqual(['CONFIG_CORRUPT']);
    expect(recorder.recent({ class: 'user' }).map((one) => one.code)).toEqual(['CONFIG_CORRUPT']);
    expect(recorder.recent({ code: 'READ_FAILED', limit: 1 })).toHaveLength(1);
    const latest = recorder.recent().at(-1)?.ts ?? 0;
    expect(recorder.recent({ since: latest })).toHaveLength(1);
  });

  it('按码计数：次数与最近一次时间都跟着涨', () => {
    const recorder = recorderOf();
    recorder.record({ code: 'READ_FAILED' });
    recorder.record({ code: 'READ_FAILED' });

    const counts = recorder.counts();
    expect(counts.get('READ_FAILED')?.count).toBe(2);
    expect(counts.get('READ_FAILED')?.at).toBe(1_020);
  });

  it('★ sink 抛错不打断内存记录，也不影响其它 sink；失败本身记一条', () => {
    const seen: DiagRecord[] = [];
    const recorder = recorderOf({
      sinks: [
        () => {
          throw new Error('disk full');
        },
        (record) => seen.push(record),
      ],
    });

    const record = recorder.record({ code: 'READ_FAILED' });

    expect(record?.code).toBe('READ_FAILED');
    expect(seen.map((one) => one.code)).toEqual(['READ_FAILED']);
    const failed = recorder.recent({ code: 'DIAG_SINK_FAILED' });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.detail?.['sink']).toBe(0);
    expect(recorder.counts().get('READ_FAILED')?.count).toBe(1);
  });

  it('同一个坏 sink 只报一次，不每条记录都刷', () => {
    const recorder = recorderOf({
      sinks: [
        () => {
          throw new Error('bad');
        },
      ],
    });

    recorder.record({ code: 'READ_FAILED' });
    recorder.record({ code: 'READ_FAILED' });

    expect(recorder.recent({ code: 'DIAG_SINK_FAILED' })).toHaveLength(1);
  });

  it('★ 订阅者抛错即被移除，其它订阅者照常收到', () => {
    const recorder = recorderOf();
    const good = vi.fn();
    recorder.subscribe(() => {
      throw new Error('boom');
    });
    recorder.subscribe(good);

    recorder.record({ code: 'READ_FAILED' });
    recorder.record({ code: 'READ_FAILED' });

    expect(good).toHaveBeenCalledTimes(2);
  });

  it('★ once：同一个键只记一次（轮询不刷屏），不同键各记一条', () => {
    const recorder = recorderOf();

    expect(recorder.once('mod:@a', { code: 'MODULE_UNREADABLE', subject: { pkg: '@a' } })).not.toBeNull();
    expect(recorder.once('mod:@a', { code: 'MODULE_UNREADABLE', subject: { pkg: '@a' } })).toBeNull();
    expect(recorder.once('mod:@b', { code: 'MODULE_UNREADABLE', subject: { pkg: '@b' } })).not.toBeNull();

    expect(recorder.recent({ code: 'MODULE_UNREADABLE' })).toHaveLength(2);
  });

  it('once 被级别过滤掉时不占键，之后够级别的还能记上', () => {
    const recorder = recorderOf({ level: 'error' });
    expect(recorder.once('k', { code: 'READ_FAILED', level: 'info' })).toBeNull();
    expect(recorder.once('k', { code: 'READ_FAILED', level: 'error' })).not.toBeNull();
  });

  it('★ 记录带宿主来源：写入时盖章，once 与 sink 失败记录同样带', () => {
    const host: DiagHost = { profile: 'web', deployment: 'web', pid: 42 };
    const recorder = recorderOf({
      host,
      sinks: [
        () => {
          throw new Error('boom');
        },
      ],
    });

    const record = recorder.record({ code: 'READ_FAILED' });
    expect(record?.host).toEqual(host);
    expect(recorder.once('k', { code: 'READ_FAILED' })?.host).toEqual(host);
    expect(recorder.recent({ code: 'DIAG_SINK_FAILED' })[0]?.host).toEqual(host);
  });

  it('★ 按宿主过滤：指定 profile、*、旧记录归 unknown', () => {
    const host: DiagHost = { profile: 'web', deployment: 'web', pid: 42 };
    const recorder = recorderOf({ host });
    recorder.record({ code: 'READ_FAILED' });

    expect(recorder.recent({ host: 'web' })).toHaveLength(1);
    expect(recorder.recent({ host: 'desktop' })).toHaveLength(0);
    expect(recorder.recent({ host: '*' })).toHaveLength(1);

    const legacy = recorderOf();
    legacy.record({ code: 'READ_FAILED' });
    expect(legacy.recent({ host: 'unknown' })).toHaveLength(1);
    expect(legacy.recent({ host: 'web' })).toHaveLength(0);
  });

  it('级别过滤：低于阈值的记录不落内存、不进 sink', () => {
    const seen: DiagRecord[] = [];
    const recorder = recorderOf({ level: 'error', sinks: [(record) => seen.push(record)] });

    expect(recorder.record({ code: 'READ_FAILED', level: 'info' })).toBeNull();
    expect(recorder.record({ code: 'DIAG_BAD_PARAM', level: 'warn' })).toBeNull();
    expect(recorder.record({ code: 'SELF_UPDATE_FAILED', level: 'error' })).not.toBeNull();
    expect(seen.map((one) => one.code)).toEqual(['SELF_UPDATE_FAILED']);
    expect(recorder.recent()).toHaveLength(1);
  });

  it('★★ 落盘失败只冷却重试：恢复后 sinkStatus 回到 ok，失败记录不重复刷', () => {
    let at = 1_000_000;
    let calls = 0;
    const recorder = createDiagRecorder({
      clock: () => at,
      nextCorrId: () => 'c-1',
      level: 'info',
      sinks: [
        () => {
          calls += 1;
          if (calls === 1) throw new Error('EACCES');
        },
      ],
    });

    recorder.record({ code: 'READ_FAILED' });
    expect(recorder.sinkStatus()).toMatchObject({ ok: false, error: 'EACCES' });
    recorder.record({ code: 'READ_FAILED' });
    expect(calls).toBe(1);

    at += DIAG_SINK_RETRY_MS + 1;
    recorder.record({ code: 'READ_FAILED' });
    expect(recorder.sinkStatus().ok).toBe(true);
    expect(recorder.recent({ code: 'DIAG_SINK_FAILED' })).toHaveLength(1);
  });
});
