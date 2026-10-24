import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshLayoutPanels } from '@dsh-workbench/shared';
import { STORAGE_KEY_RIGHTBAR_WIDTH } from '@dsh-workbench/shared';
import {
  createRightbarWidthMemory,
  ensureRightbarWidthMemory,
  parseRightbarWidth,
  readRightbarWidth,
  releaseRightbarWidthMemory,
  restoreRightbarWidth,
  RIGHTBAR_DEFAULT_WIDTH,
  RIGHTBAR_WIDTH_MAX,
  seedRightbarWidth,
  writeRightbarWidth,
} from './rightbar-width';

function fakePanels(): { panels: DshLayoutPanels; calls: number[] } {
  const calls: number[] = [];
  return { panels: { setRightbar: (px) => calls.push(px) }, calls };
}

function textWriter() {
  const entries: Array<[string, string | null]> = [];
  return { write: (key: string, value: string | null) => void entries.push([key, value]), entries };
}

function widthWriter() {
  const widths: number[] = [];
  return { write: (px: number) => void widths.push(px), widths };
}

function memoryStorage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function recordingStorage() {
  const writes: Array<[string, string]> = [];
  const data = new Map<string, string>();
  return {
    writes,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push([key, value]);
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRightbarWidth', () => {
  it('读得懂存过的像素值', () => {
    expect(parseRightbarWidth('612')).toBe(612);
    expect(parseRightbarWidth('612.4')).toBe(612);
    expect(parseRightbarWidth(' 720 ')).toBe(720);
  });

  it('没有 / 不是数 / 不是正的 → 当没存', () => {
    expect(parseRightbarWidth(null)).toBeNull();
    expect(parseRightbarWidth('')).toBeNull();
    expect(parseRightbarWidth('abc')).toBeNull();
    expect(parseRightbarWidth('-1')).toBeNull();
    expect(parseRightbarWidth('0')).toBeNull();
    expect(parseRightbarWidth('NaN')).toBeNull();
  });

  it('荒唐的大值收到上界', () => {
    expect(parseRightbarWidth('999999')).toBe(RIGHTBAR_WIDTH_MAX);
  });
});

describe('readRightbarWidth / writeRightbarWidth', () => {
  it('★ 从那个 key 读回来', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage({ [STORAGE_KEY_RIGHTBAR_WIDTH]: '640' }) });
    expect(readRightbarWidth()).toBe(640);
  });

  it('存的是脏值 → 当没存', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage({ [STORAGE_KEY_RIGHTBAR_WIDTH]: 'abc' }) });
    expect(readRightbarWidth()).toBeNull();
  });

  it('localStorage 不可用（隐私模式）不崩', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
      },
    });
    expect(readRightbarWidth()).toBeNull();
  });

  it('★ 落盘取整、收上界；非法值一个字都不写', () => {
    const { write, entries } = textWriter();
    writeRightbarWidth(612.4, write);
    writeRightbarWidth(999999, write);
    writeRightbarWidth(Number.NaN, write);
    writeRightbarWidth(0, write);
    writeRightbarWidth(-30, write);
    expect(entries).toEqual([
      [STORAGE_KEY_RIGHTBAR_WIDTH, '612'],
      [STORAGE_KEY_RIGHTBAR_WIDTH, String(RIGHTBAR_WIDTH_MAX)],
    ]);
  });
});

describe('createRightbarWidthMemory', () => {
  it('★ dsh 拖拽（非 seed）→ 原样转发 + 落盘', () => {
    const { panels, calls } = fakePanels();
    const { write, widths } = widthWriter();
    createRightbarWidthMemory(panels, write);
    panels.setRightbar?.(700);
    expect(calls).toEqual([700]);
    expect(widths).toEqual([700]);
  });

  it('★ 自己 seed 不落盘，seed 完接着拖还能落盘', () => {
    const { panels, calls } = fakePanels();
    const { write, widths } = widthWriter();
    const memory = createRightbarWidthMemory(panels, write);
    memory.seed(420);
    panels.setRightbar?.(500);
    expect(calls).toEqual([420, 500]);
    expect(widths).toEqual([500]);
  });

  it('★ 非法入参既不转发也不落盘（dsh 自己那层 clampWidth 不挡 NaN）', () => {
    const { panels, calls } = fakePanels();
    const { write, widths } = widthWriter();
    createRightbarWidthMemory(panels, write);
    panels.setRightbar?.(Number.NaN);
    panels.setRightbar?.(0);
    panels.setRightbar?.(-12);
    expect(calls).toEqual([]);
    expect(widths).toEqual([]);
  });

  it('dispose 还原进入时那个函数', () => {
    const { panels } = fakePanels();
    const original = panels.setRightbar;
    const { write } = widthWriter();
    const memory = createRightbarWidthMemory(panels, write);
    expect(panels.setRightbar).not.toBe(original);
    memory.dispose();
    expect(panels.setRightbar).toBe(original);
  });

  it('dsh 没有 setRightbar（老版本）→ 空实现，不炸', () => {
    const { write, widths } = widthWriter();
    expect(() => createRightbarWidthMemory({}, write).seed(420)).not.toThrow();
    expect(() => createRightbarWidthMemory(undefined, write).seed(420)).not.toThrow();
    expect(widths).toEqual([]);
  });
});

describe('ensureRightbarWidthMemory / releaseRightbarWidthMemory', () => {
  it('★ 同一个对象只包一层（拖一次只写一次）', () => {
    const { panels } = fakePanels();
    const { write, widths } = widthWriter();
    const first = ensureRightbarWidthMemory(panels, write);
    const second = ensureRightbarWidthMemory(panels, write);
    expect(second).toBe(first);
    panels.setRightbar?.(640);
    expect(widths).toEqual([640]);
  });

  it('release 之后回到 dsh 原本那个（再调不落盘）', () => {
    const { panels } = fakePanels();
    const original = panels.setRightbar;
    const { write, widths } = widthWriter();
    ensureRightbarWidthMemory(panels, write);
    releaseRightbarWidthMemory(panels);
    expect(panels.setRightbar).toBe(original);
    panels.setRightbar?.(900);
    expect(widths).toEqual([]);
  });

  it('release 之后还能重新包上（dsh 重建了 store 的场合）', () => {
    const { panels } = fakePanels();
    const { write, widths } = widthWriter();
    ensureRightbarWidthMemory(panels, write);
    releaseRightbarWidthMemory(panels);
    ensureRightbarWidthMemory(panels, write);
    panels.setRightbar?.(800);
    expect(widths).toEqual([800]);
  });

  it('没有 panels → 空实现，release 也不炸', () => {
    const { write, widths } = widthWriter();
    expect(() => ensureRightbarWidthMemory(undefined, write).seed(1)).not.toThrow();
    expect(() => releaseRightbarWidthMemory(undefined)).not.toThrow();
    expect(widths).toEqual([]);
  });
});

describe('restoreRightbarWidth / seedRightbarWidth', () => {
  it('★★ 没存过也要把包装装上（dsh 面板在座那档：拖一下就得记得住）', () => {
    const { panels, calls } = fakePanels();
    const original = panels.setRightbar;
    restoreRightbarWidth(panels, null);
    expect(panels.setRightbar).not.toBe(original);
    panels.setRightbar?.(700);
    expect(calls).toEqual([700]);
  });

  it('存过就 seed 那个值，而且不落盘', () => {
    const { panels, calls } = fakePanels();
    const storage = recordingStorage();
    vi.stubGlobal('window', { localStorage: storage });
    restoreRightbarWidth(panels, 640);
    expect(calls).toEqual([640]);
    expect(storage.writes).toEqual([]);
  });

  it('★★ 装完之后拖一下真的落到那个 key（原缺陷那条路：装是装、拖要落盘）', () => {
    const { panels } = fakePanels();
    const storage = recordingStorage();
    vi.stubGlobal('window', { localStorage: storage });
    restoreRightbarWidth(panels, null);
    panels.setRightbar?.(700);
    expect(storage.writes).toEqual([[STORAGE_KEY_RIGHTBAR_WIDTH, '700']]);
  });

  it('没存过：boot 不动 dsh 的默认，工作台面板在座才给 420', () => {
    const { panels, calls } = fakePanels();
    const storage = recordingStorage();
    vi.stubGlobal('window', { localStorage: storage });
    restoreRightbarWidth(panels, null);
    expect(calls).toEqual([]);
    seedRightbarWidth(panels, null);
    expect(calls).toEqual([RIGHTBAR_DEFAULT_WIDTH]);
    expect(storage.writes).toEqual([]);
  });

  it('存过：工作台面板在座也给存过的那个，不是 420', () => {
    const { panels, calls } = fakePanels();
    seedRightbarWidth(panels, 640);
    expect(calls).toEqual([640]);
  });

  it('没有 panels → 两个入口都不炸', () => {
    expect(() => restoreRightbarWidth(undefined, 640)).not.toThrow();
    expect(() => seedRightbarWidth(undefined, null)).not.toThrow();
  });
});
