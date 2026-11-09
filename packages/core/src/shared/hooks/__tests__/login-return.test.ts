import { describe, expect, it } from 'vitest';
import { LOGIN_RETURN_MIN_MS, watchLoginReturn, type LoginReturnEvent } from '../login-return';

function harness(minimumMs = 1000) {
  const listeners = new Set<(event: LoginReturnEvent) => void>();
  const retries: number[] = [];
  let unsubscribed = 0;
  let now = 0;
  const stop = watchLoginReturn({
    onRetry: () => retries.push(now),
    now: () => now,
    minimumMs,
    hidden: () => false,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        unsubscribed += 1;
        listeners.delete(listener);
      };
    },
  });
  const emit = (event: LoginReturnEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };
  return {
    emit,
    retries,
    stop,
    setNow: (value: number): void => {
      now = value;
    },
    unsubscribed: (): number => unsubscribed,
  };
}

describe('打开登录页后，切回来才自动重试', () => {
  it('开了链接但没离开 → 一次都不重试', () => {
    const h = harness();
    h.emit('visible');
    h.emit('focus');
    expect(h.retries).toEqual([]);
    expect(h.unsubscribed()).toBe(0);
  });

  it('★ 离开再回来、离开时间够了 → 重试；下次离开再回来还能再试', () => {
    const h = harness();
    h.emit('hidden');
    h.setNow(2000);
    h.emit('visible');
    expect(h.retries).toEqual([2000]);
    h.setNow(3000);
    h.emit('hidden');
    h.setNow(6000);
    h.emit('visible');
    expect(h.retries).toEqual([2000, 6000]);
    expect(h.unsubscribed()).toBe(0);
  });

  it('★ 回来得太早不算，但下一次离开再回来仍然能重试', () => {
    const h = harness(LOGIN_RETURN_MIN_MS);
    h.emit('hidden');
    h.setNow(400);
    h.emit('visible');
    expect(h.retries).toEqual([]);
    h.setNow(1000);
    h.emit('hidden');
    h.setNow(3000);
    h.emit('visible');
    expect(h.retries).toEqual([3000]);
  });

  it('同一次回来里重复的 visible / focus 只算一次', () => {
    const h = harness();
    h.emit('blur');
    h.setNow(2000);
    h.emit('focus');
    h.emit('visible');
    h.emit('focus');
    expect(h.retries).toHaveLength(1);
  });

  it('只 blur / hidden、没回来 → 不触发', () => {
    const h = harness();
    h.emit('blur');
    h.emit('hidden');
    expect(h.retries).toEqual([]);
  });

  it('stop 之后回来也不再重试', () => {
    const h = harness();
    h.emit('hidden');
    h.stop();
    h.setNow(2000);
    h.emit('visible');
    expect(h.retries).toEqual([]);
    expect(h.unsubscribed()).toBe(1);
  });

  it('打开时已经在后台 → 回来时算离开时间', () => {
    const listeners = new Set<(event: LoginReturnEvent) => void>();
    const retries: number[] = [];
    let now = 0;
    watchLoginReturn({
      onRetry: () => retries.push(now),
      now: () => now,
      minimumMs: 1000,
      hidden: () => true,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    now = 1500;
    for (const listener of [...listeners]) listener('visible');
    expect(retries).toEqual([1500]);
  });
});
