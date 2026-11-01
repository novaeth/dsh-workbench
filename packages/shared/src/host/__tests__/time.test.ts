import { afterEach, describe, expect, it, vi } from 'vitest';
import { clockOf, epochOf, now, nowIso } from '../time.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('宿主时间入口', () => {
  it('now 读的是 Date.now，nowIso 是合法 ISO', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    expect(now()).toBe(Date.parse('2026-01-02T03:04:05.000Z'));
    expect(nowIso()).toBe('2026-01-02T03:04:05.000Z');
  });

  it('格式化助手仍只看传入值', () => {
    expect(clockOf(0)).toBe('00:00:00');
    expect(epochOf('1970-01-01T00:00:01.000Z')).toBe(1000);
  });
});
