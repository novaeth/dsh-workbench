import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDshColumnSource } from '../dsh-column-source';

describe('createDshColumnSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('起手读一次；订阅后按节拍复查，值变了才通知', () => {
    let open = true;
    const source = createDshColumnSource(() => open, 400);
    expect(source.getSnapshot()).toBe(true);

    let notified = 0;
    const off = source.subscribe(() => {
      notified += 1;
    });

    vi.advanceTimersByTime(1200);
    expect(notified).toBe(0);

    open = false;
    vi.advanceTimersByTime(400);
    expect(source.getSnapshot()).toBe(false);
    expect(notified).toBe(1);

    vi.advanceTimersByTime(800);
    expect(notified).toBe(1);

    off();
  });

  it('多个订阅者共用一条节拍（不是一人一条）', () => {
    let reads = 0;
    const source = createDshColumnSource(() => {
      reads += 1;
      return false;
    }, 400);
    const before = reads;

    const offA = source.subscribe(() => {});
    const offB = source.subscribe(() => {});
    vi.advanceTimersByTime(400);
    expect(reads - before).toBe(1);

    offA();
    offB();
  });

  it('没人订阅就停表（退订清掉定时器，不再读）', () => {
    let reads = 0;
    const source = createDshColumnSource(() => {
      reads += 1;
      return false;
    }, 400);

    const off = source.subscribe(() => {});
    vi.advanceTimersByTime(400);
    const afterFirstTick = reads;

    off();
    vi.advanceTimersByTime(2000);
    expect(reads).toBe(afterFirstTick);
  });
});
