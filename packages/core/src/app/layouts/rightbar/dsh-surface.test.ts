import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDshSurfaceWatch, dshSeatOnScreen, DSH_SEAT_ATTRIBUTE } from './dsh-surface';

function host(present: boolean) {
  const seen: string[] = [];
  return {
    seen,
    querySelector(selector: string) {
      seen.push(selector);
      return present ? { id: 'seat' } : null;
    },
  };
}

describe('dshSeatOnScreen', () => {
  it('官方椅面画在屏上就算在（dsh 只给了这个可观察的事实）', () => {
    const dom = host(true);
    expect(dshSeatOnScreen(dom)).toBe(true);
    expect(dom.seen).toEqual([`[${DSH_SEAT_ATTRIBUTE}]`]);
  });

  it('椅面没画（工作台那列占着座位）就不算在', () => {
    expect(dshSeatOnScreen(host(false))).toBe(false);
  });

  it('没有 document（非浏览器环境）不算在，也不抛', () => {
    expect(dshSeatOnScreen(undefined)).toBe(false);
  });
});

describe('createDshSurfaceWatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('没就绪就一直等，就绪那一拍通知一次', () => {
    let drawn = false;
    let ready = 0;
    const watch = createDshSurfaceWatch(() => drawn, () => { ready += 1; }, 60);

    watch.arm();
    vi.advanceTimersByTime(600);
    expect(ready).toBe(0);

    drawn = true;
    vi.advanceTimersByTime(60);
    expect(ready).toBe(1);
  });

  it('通知过就停表（不再读、不再通知）', () => {
    let reads = 0;
    let ready = 0;
    const watch = createDshSurfaceWatch(
      () => {
        reads += 1;
        return true;
      },
      () => { ready += 1; },
      60,
    );

    watch.arm();
    vi.advanceTimersByTime(60);
    expect(ready).toBe(1);
    const settled = reads;

    vi.advanceTimersByTime(1200);
    expect(ready).toBe(1);
    expect(reads).toBe(settled);
  });

  it('重复 arm 共用一条节拍', () => {
    let reads = 0;
    const watch = createDshSurfaceWatch(() => { reads += 1; return false; }, () => {}, 60);

    watch.arm();
    watch.arm();
    vi.advanceTimersByTime(60);
    expect(reads).toBe(1);
    watch.disarm();
  });

  it('disarm 之后彻底不读', () => {
    let reads = 0;
    const watch = createDshSurfaceWatch(() => { reads += 1; return false; }, () => {}, 60);

    watch.arm();
    vi.advanceTimersByTime(60);
    watch.disarm();
    const settled = reads;
    vi.advanceTimersByTime(1200);
    expect(reads).toBe(settled);
  });

  it('就绪那一拍先停表再通知（回调里再 arm 不会撞上旧表）', () => {
    let drawn = false;
    let ready = 0;
    const watch = createDshSurfaceWatch(() => drawn, () => {
      ready += 1;
      watch.arm();
    }, 60);

    watch.arm();
    drawn = true;
    vi.advanceTimersByTime(60);
    expect(ready).toBe(1);
    watch.disarm();
  });
});
