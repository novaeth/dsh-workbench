import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cx,
  parseLocalTimestamp,
  relativeTime,
  relativeTimeAgo,
  relativeTimeBucket,
  relativeTimeCompact,
  shortenPath,
  type TimeTranslate,
} from '../ui.js';

const t: TimeTranslate = (key, params) => {
  if (params === undefined) return key;
  return `${key}:${String(params.n ?? params.t ?? '')}`;
};

const NOW = dayjs('2026-09-27T12:00:00.000Z').valueOf();

describe('cx', () => {
  it('拼上真值、丢掉假值', () => {
    expect(cx('a', false, undefined, null, '', 'b')).toBe('a b');
  });

  it('全假值给空串', () => {
    expect(cx(false, undefined)).toBe('');
  });
});

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('按档位取词：刚刚 / 分钟 / 小时 / 天', () => {
    expect(relativeTime(NOW - 30_000, t)).toBe('time.now');
    expect(relativeTime(NOW - 3 * 60_000, t)).toBe('time.minutes:3');
    expect(relativeTime(NOW - 5 * 60 * 60_000, t)).toBe('time.hours:5');
    expect(relativeTime(NOW - 3 * 24 * 60 * 60_000, t)).toBe('time.days:3');
  });

  it('档位边界落在正确的一侧', () => {
    expect(relativeTime(NOW - (60 * 60_000 - 1), t)).toBe('time.minutes:59');
    expect(relativeTime(NOW - 60 * 60_000, t)).toBe('time.hours:1');
    expect(relativeTime(NOW - 6 * 24 * 60 * 60_000, t)).toBe('time.days:6');
    expect(relativeTime(NOW - 7 * 24 * 60 * 60_000, t)).not.toContain('time.');
  });

  it('★ 过了 7 天要给到时分秒：只剩日子的话，"哪一次同步"根本分不出来', () => {
    const old = relativeTime(NOW - 8 * 24 * 60 * 60_000, t);

    expect(old).not.toContain('time.');
    expect(old.match(/:/g)).toHaveLength(2);
    expect(old).toContain(String(dayjs(NOW).year()));
  });

  it('非法时间戳给空串而不是 NaN', () => {
    expect(relativeTime(Number.NaN, t)).toBe('');
    expect(relativeTime(Number.POSITIVE_INFINITY, t)).toBe('');
  });
});

describe('relativeTimeBucket / relativeTimeCompact / relativeTimeAgo（会话行那一列）', () => {
  const at = (ago: number): number => NOW - ago;
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  it('★ 档位与 dsh 的 relative-time 逐条一致：now / minutes / hours / days / months / years', () => {
    expect(relativeTimeBucket(at(30_000), NOW)).toEqual({ unit: 'now', n: 0 });
    expect(relativeTimeBucket(at(3 * MIN), NOW)).toEqual({ unit: 'minutes', n: 3 });
    expect(relativeTimeBucket(at(5 * HOUR), NOW)).toEqual({ unit: 'hours', n: 5 });
    expect(relativeTimeBucket(at(3 * DAY), NOW)).toEqual({ unit: 'days', n: 3 });
    expect(relativeTimeBucket(at(40 * DAY), NOW)).toEqual({ unit: 'months', n: 1 });
    expect(relativeTimeBucket(at(400 * DAY), NOW)).toEqual({ unit: 'years', n: 1 });
  });

  it('★ 边界在 30 天与 365 天那一侧（dsh 的分档，不是我们的 7 天）', () => {
    expect(relativeTimeBucket(at(29 * DAY), NOW)?.unit).toBe('days');
    expect(relativeTimeBucket(at(30 * DAY), NOW)?.unit).toBe('months');
    expect(relativeTimeBucket(at(364 * DAY), NOW)?.unit).toBe('months');
    expect(relativeTimeBucket(at(365 * DAY), NOW)?.unit).toBe('years');
  });

  it('未来时间钳到 now（不当成负档）', () => {
    expect(relativeTimeBucket(NOW + MIN, NOW)).toEqual({ unit: 'now', n: 0 });
  });

  it('非法时间戳：桶给 null、两句都给空串', () => {
    expect(relativeTimeBucket(Number.NaN, NOW)).toBeNull();
    expect(relativeTimeBucket(NOW, Number.NaN)).toBeNull();
    expect(relativeTimeCompact(Number.NaN, t, NOW)).toBe('');
    expect(relativeTimeAgo(Number.NaN, t, NOW)).toBe('');
  });

  it('★ 行里是紧凑写法，悬停卡才补「前」；now 那一档两处都不加', () => {
    expect(relativeTimeCompact(at(3 * MIN), t, NOW)).toBe('time.short.minutes:3');
    expect(relativeTimeCompact(at(40 * DAY), t, NOW)).toBe('time.short.months:1');
    expect(relativeTimeAgo(at(3 * MIN), t, NOW)).toBe('time.ago:time.short.minutes:3');
    expect(relativeTimeCompact(at(30_000), t, NOW)).toBe('time.now');
    expect(relativeTimeAgo(at(30_000), t, NOW)).toBe('time.now');
  });
});

describe('shortenPath', () => {
  it('把用户主目录缩成 ~', () => {
    expect(shortenPath('/Users/you/dev/app')).toBe('~/dev/app');
  });

  it('非用户目录原样返回', () => {
    expect(shortenPath('/Volumes/dev/app')).toBe('/Volumes/dev/app');
  });

  it('非字符串给空串', () => {
    expect(shortenPath(undefined)).toBe('');
    expect(shortenPath(42)).toBe('');
  });
});

describe('parseLocalTimestamp', () => {
  it('按本地时区解析 Coding 的时间戳形态', () => {
    const parsed = parseLocalTimestamp('2026-09-27 08:18:36');
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBe(dayjs('2026-09-27T08:18:36').valueOf());
  });

  it('也接受 ISO 的 T 分隔写法', () => {
    expect(parseLocalTimestamp('2026-09-27T08:18:36')).toBe(
      dayjs('2026-09-27T08:18:36').valueOf(),
    );
  });

  it('形态不认识给 NaN（调用方回退到原始字符串，宁可不换算也不显示错时间）', () => {
    for (const raw of ['', '  ', null, undefined, '2026-09-27', '2026/09/27 08:18:36', 'abc']) {
      expect(Number.isNaN(parseLocalTimestamp(raw)), String(raw)).toBe(true);
    }
  });

  it('容忍首尾空白', () => {
    expect(parseLocalTimestamp('  2026-09-27 08:18:36  ')).toBe(
      dayjs('2026-09-27T08:18:36').valueOf(),
    );
  });
});
