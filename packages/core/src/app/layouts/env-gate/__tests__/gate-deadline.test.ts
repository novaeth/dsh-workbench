import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateDeadline } from '../gate-deadline';

describe('createGateDeadline：门自己知道什么时候让开', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('★ 到点就喊一次（轮询发不出去时也不许永远盖着）', () => {
    const expire = vi.fn();
    createGateDeadline(120_000, expire);

    vi.advanceTimersByTime(119_999);
    expect(expire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600_000);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('门已经关了 → 到点也不再喊', () => {
    const expire = vi.fn();
    const deadline = createGateDeadline(120_000, expire);

    deadline.disarm();
    vi.advanceTimersByTime(600_000);

    expect(expire).not.toHaveBeenCalled();
  });
});
