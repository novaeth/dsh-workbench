import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDshBorrow } from '../dsh-borrow';

function fakeOfficial() {
  return {
    expanded: false,
    toggles: 0,
    refuses: false,
    isExpanded() {
      return this.expanded;
    },
    toggleExpanded() {
      if (this.refuses) throw new Error('sidebarRight: no session surface is mounted');
      this.toggles += 1;
      this.expanded = !this.expanded;
    },
    openResource(address: string) {
      this.opened.push(['resource', address]);
    },
    openTab(kind: string) {
      this.opened.push(['tab', kind]);
    },
    opened: [] as unknown[][],
    mounted: {
      value: 's1' as string | undefined,
      listeners: new Set<() => void>(),
      getSnapshot() {
        return this.value;
      },
      subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    },
  };
}

function seatHost(onScreen: boolean) {
  globalThis.document = {
    querySelector: () => (onScreen ? { id: 'seat' } : null),
  } as unknown as Document;
}

describe('createDshBorrow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seatHost(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('官方服务不在就什么都不做（不是抛）', () => {
    const borrow = createDshBorrow({
      official: () => undefined,
      yieldColumn: () => {
        throw new Error('yielded');
      },
      reclaimColumn: () => {
        throw new Error('reclaimed');
      },
    });
    expect(borrow.open()).toBe(false);
    borrow.use(() => {
      throw new Error('called');
    });
    borrow.toggle();
    borrow.dispose();
  });

  it('按下态：没有会话在屏上也算开着；会话在屏上就看它展开没有', () => {
    const official = fakeOfficial();
    const borrow = createDshBorrow({ official: () => official, yieldColumn: () => {}, reclaimColumn: () => {} });

    official.mounted.value = undefined;
    expect(borrow.open()).toBe(true);

    official.mounted.value = 's1';
    expect(borrow.open()).toBe(false);
    official.expanded = true;
    expect(borrow.open()).toBe(true);
  });

  it('椅面已在：借道直接透传，不绕', () => {
    const official = fakeOfficial();
    seatHost(true);
    const borrow = createDshBorrow({ official: () => official, yieldColumn: () => {}, reclaimColumn: () => {} });

    borrow.start();
    official.openResource('dsh-resource://file/s1/a.md');
    expect(official.opened).toEqual([['resource', 'dsh-resource://file/s1/a.md']]);
  });

  it('椅面没画出来：先让位、那次打开候着；椅面画出来那一拍补上（只补一次）', () => {
    const official = fakeOfficial();
    let yields = 0;
    const borrow = createDshBorrow({
      official: () => official,
      yieldColumn: () => {
        yields += 1;
      },
      reclaimColumn: () => {},
    });

    borrow.start();
    official.openResource('dsh-resource://file/s1/a.md');
    expect(yields).toBe(1);
    expect(official.opened).toEqual([]);

    seatHost(true);
    vi.advanceTimersByTime(60);
    expect(official.toggles).toBe(1);
    expect(official.opened).toEqual([['resource', 'dsh-resource://file/s1/a.md']]);

    vi.advanceTimersByTime(600);
    expect(official.opened).toHaveLength(1);
  });

  it('回到工作台那列：让位候着的那次打开作废（用户已经走开了）', () => {
    const official = fakeOfficial();
    let reclaims = 0;
    const borrow = createDshBorrow({
      official: () => official,
      yieldColumn: () => {},
      reclaimColumn: () => {
        reclaims += 1;
      },
    });

    borrow.start();
    official.openResource('dsh-resource://file/s1/a.md');
    borrow.back();
    expect(reclaims).toBe(1);

    seatHost(true);
    vi.advanceTimersByTime(600);
    expect(official.opened).toEqual([]);
    expect(official.toggles).toBe(0);
  });

  it('切换那颗钮：椅面没画出来先候着，画出来了再展开', () => {
    const official = fakeOfficial();
    const borrow = createDshBorrow({ official: () => official, yieldColumn: () => {}, reclaimColumn: () => {} });

    borrow.toggle();
    expect(official.toggles).toBe(0);

    seatHost(true);
    vi.advanceTimersByTime(60);
    expect(official.toggles).toBe(1);
    expect(official.expanded).toBe(true);

    borrow.toggle();
    expect(official.toggles).toBe(2);
  });

  it('官方还接不了（这一拍还没有会话说）：候着，能接那一拍就展开', () => {
    const official = fakeOfficial();
    official.refuses = true;
    let yields = 0;
    const borrow = createDshBorrow({
      official: () => official,
      yieldColumn: () => {
        yields += 1;
      },
      reclaimColumn: () => {},
    });

    borrow.start();
    official.openResource('dsh-resource://file/s1/a.md');
    expect(yields).toBe(1);

    vi.advanceTimersByTime(60);
    expect(official.expanded).toBe(false);
    expect(official.opened).toEqual([]);

    official.refuses = false;
    vi.advanceTimersByTime(60);
    expect(official.expanded).toBe(true);
    expect(official.opened).toEqual([['resource', 'dsh-resource://file/s1/a.md']]);
  });

  it('还没等椅面画出来、官方就能接了：会话一换就当场展开，不耗那 60 毫秒', () => {
    const official = fakeOfficial();
    const borrow = createDshBorrow({
      official: () => official,
      yieldColumn: () => {},
      reclaimColumn: () => {},
    });

    borrow.start();
    official.openResource('dsh-resource://file/s1/a.md');
    expect(official.opened).toEqual([]);

    official.mounted.value = 's2';
    for (const listener of official.mounted.listeners) listener();

    expect(official.toggles).toBe(1);
    expect(official.expanded).toBe(true);
    expect(official.opened).toEqual([['resource', 'dsh-resource://file/s1/a.md']]);
  });

  it('dispose 把借道的接线还回去（不把包装留在别人的控制器上）', () => {
    const official = fakeOfficial();
    seatHost(true);
    const borrow = createDshBorrow({ official: () => official, yieldColumn: () => {}, reclaimColumn: () => {} });

    borrow.start();
    const shimmed = official.openResource;
    borrow.dispose();
    expect(official.openResource).not.toBe(shimmed);

    official.openResource('dsh-resource://file/s1/a.md');
    expect(official.opened).toEqual([['resource', 'dsh-resource://file/s1/a.md']]);
  });
});
