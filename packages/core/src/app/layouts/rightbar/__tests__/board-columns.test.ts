import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS_AT,
  BOARD_COLUMN_GAP,
  BOARD_COLUMN_MIN_WIDTH,
  BOARD_PANEL_PADDING,
  boardAssignment,
  boardImproves,
  boardLayout,
  boardColumnCount,
  boardColumnIndexes,
  boardColumnsByHeight,
  roundRobinColumns,
} from '../board-columns';

const letters = (count: number): readonly string[] =>
  Array.from({ length: count }, (_unused, index) => String.fromCharCode(97 + index));

describe('boardColumnCount', () => {
  it('列数由面板宽度算出来，不是写死的两列：每列至少 332 + 列间距 12 + 两侧 padding 24', () => {
    expect(BOARD_COLUMN_MIN_WIDTH).toBe(332);
    expect(BOARD_COLUMN_GAP).toBe(12);
    expect(BOARD_PANEL_PADDING).toBe(12);
    expect(BOARD_COLUMNS_AT).toBe(700);
    expect(boardColumnCount(BOARD_COLUMNS_AT - 1, 9)).toBe(1);
    expect(boardColumnCount(BOARD_COLUMNS_AT, 9)).toBe(2);
    expect(boardColumnCount(1043, 9)).toBe(2);
    expect(boardColumnCount(1044, 9)).toBe(3);
    expect(boardColumnCount(1388, 9)).toBe(4);
    expect(boardColumnCount(2560, 9)).toBe(7);
  });

  it('宽度还不知道（0 / 负数 / NaN）时按单列走 —— 宁可窄，不许先抖一下', () => {
    expect(boardColumnCount(0, 9)).toBe(1);
    expect(boardColumnCount(-1, 9)).toBe(1);
    expect(boardColumnCount(Number.NaN, 9)).toBe(1);
  });

  it('列数不超过卡片张数 —— 不摆空列（只有一张卡就不分列）', () => {
    expect(boardColumnCount(3000, 1)).toBe(1);
    expect(boardColumnCount(3000, 2)).toBe(2);
    expect(boardColumnCount(3000, 0)).toBe(1);
  });
});

describe('roundRobinColumns', () => {
  it('按面板顺序一行一行填：1 号在第 1 列、2 号在第 2 列、到最后一列回到第 1 列', () => {
    expect(roundRobinColumns(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'c', 'e'],
      ['b', 'd'],
    ]);
    expect(roundRobinColumns(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)).toEqual([
      ['a', 'd', 'g'],
      ['b', 'e'],
      ['c', 'f'],
    ]);
    expect(roundRobinColumns(['a', 'b'], 1)).toEqual([['a', 'b']]);
  });

  it('两列合计永远是全部、且不重复（顺序只在这几列之间重排）', () => {
    const items = Array.from({ length: 7 }, (_unused, index) => index);
    const columns = roundRobinColumns(items, 3);
    expect(columns.flat().sort((a, b) => a - b)).toEqual(items);
  });
});

describe('boardColumnsByHeight', () => {
  it('按实测高度落列：Inventory 那种一张顶两张的卡自己一列，其余去另一列（1050 / 700 / 400）', () => {
    expect(boardColumnsByHeight(letters(3), [1050, 700, 400], 2)).toEqual([['a'], ['b', 'c']]);
  });

  it('最后一张特别高时也认：200 / 200 / 900 排成「前两张一列、高的那张一列」', () => {
    expect(boardColumnsByHeight(letters(3), [200, 200, 900], 2)).toEqual([['a', 'b'], ['c']]);
  });

  it('高度差不多时与今天逐张相同（等高三张仍是 1、3 在左 / 2 在右）', () => {
    expect(boardColumnsByHeight(letters(3), [80, 80, 80], 2)).toEqual([['a', 'c'], ['b']]);
  });

  it('1 号恒在左 —— 跟今天那条是同一条不变量，按高度分列也不许把它挪走', () => {
    for (const heights of [
      [200, 200, 900],
      [900, 200, 200],
      [100, 900, 100],
      [500, 100, 900],
      [40, 900, 40, 900],
    ]) {
      const buckets = boardColumnsByHeight(letters(heights.length), heights, 2);
      expect(buckets[0]).toContain('a');
    }
  });

  it('换列要有 ≥32px 的收益：只差 10px 时不折腾（[200,200,210] 保持原序）', () => {
    expect(boardColumnsByHeight(letters(3), [200, 200, 210], 2)).toEqual([['a', 'c'], ['b']]);
    expect(boardColumnsByHeight(letters(3), [200, 200, 400], 2)).toEqual([['a', 'b'], ['c']]);
  });

  it('高度还没量出来（NaN / 张数对不上）时按顺序分 —— 现状原样；量出来是 0 的卡是一张真卡', () => {
    expect(boardColumnsByHeight(letters(3), [10, Number.NaN, 30], 2)).toEqual([['a', 'c'], ['b']]);
    expect(boardColumnsByHeight(letters(3), [10, 30], 2)).toEqual([['a', 'c'], ['b']]);
    expect(boardColumnsByHeight(letters(3), [0, 0, 0], 2)).toEqual([['a', 'c'], ['b']]);
    expect(boardAssignment([0, 400], 2)).toEqual([0, 1]);
  });

  it('单列 / 只有一张卡 / 没有卡时不进多列', () => {
    expect(boardColumnsByHeight(letters(3), [10, 20, 30], 1)).toEqual([['a', 'b', 'c']]);
    expect(boardColumnsByHeight(['only'], [700], 3)).toEqual([['only']]);
    expect(boardColumnsByHeight([], [], 3)).toEqual([[]]);
  });

  it('探针实测的数字当交叉校验：S3 五张 / S5 三张，两列高度与 内部设计记录 独立算的一致', () => {
    const s3 = boardColumnsByHeight(letters(5), [320, 640, 480, 260, 520], 2);
    expect(s3).toEqual([
      ['a', 'd', 'e'],
      ['b', 'c'],
    ]);
    const s5 = boardColumnsByHeight(letters(3), [1050, 400, 400], 2);
    expect(s5).toEqual([['a'], ['b', 'c']]);
  });

  it('三列也按同一套规则：最高的那张自己一列，剩下两张两张分（谁跟谁按「少动今天的顺序」定）', () => {
    expect(boardColumnsByHeight(letters(5), [1000, 100, 100, 100, 100], 3)).toEqual([
      ['a'],
      ['b', 'e'],
      ['c', 'd'],
    ]);
    expect(boardColumnsByHeight(letters(3), [700, 700, 700], 3)).toEqual([['a'], ['b'], ['c']]);
  });

  it('张数超过穷举上限（列数^张数 > 10 万）时退到「最短列优先」，等高时仍是顺序分列', () => {
    const items = letters(17);
    const even = roundRobinColumns(items, 2);
    expect(boardColumnsByHeight(items, items.map(() => 100), 2)).toEqual(even);
    expect(boardColumnIndexes(items.map(() => 100), 2)).toEqual(items.map((_one, index) => index % 2));
  });

  it('四列 × 七张还在穷举域内（4^7 = 16384）：一张顶几张的卡自己一列，其余三条两两分', () => {
    expect(boardColumnsByHeight(letters(7), [900, 100, 100, 100, 100, 100, 100], 4)).toEqual([
      ['a'],
      ['b', 'f'],
      ['c', 'g'],
      ['d', 'e'],
    ]);
  });

  it('任何一列都不许空着', () => {
    for (const columns of [2, 3, 4]) {
      const buckets = boardColumnsByHeight(letters(columns), [900, 100, 100, 100], columns);
      expect(buckets).toHaveLength(columns);
      expect(buckets.every((bucket) => bucket.length > 0)).toBe(true);
    }
  });
});

describe('boardLayout', () => {
  it('DOM 顺序 = 列优先拼接：先第 0 列自上而下，再第 1 列…（多列靠它是「第几列」）', () => {
    expect(boardLayout([0, 1, 1], 2)).toEqual([
      { index: 0, breakBefore: false, trailing: true },
      { index: 1, breakBefore: true, trailing: false },
      { index: 2, breakBefore: false, trailing: true },
    ]);
  });

  it('只有每列的第一张带强制列断点；第 0 列第一张不带（它是容器的开头）', () => {
    const slots = boardLayout([0, 0, 1, 2], 3);
    expect(slots.map((slot) => slot.breakBefore)).toEqual([false, false, true, true]);
    expect(slots.map((slot) => slot.index)).toEqual([0, 1, 2, 3]);
  });

  it('每列最后一张不带尾随间距（否则容器底多出一截 12px）', () => {
    expect(boardLayout([0, 1, 0, 2], 3).map((slot) => slot.trailing)).toEqual([false, true, true, true]);
  });

  it('单列就是原序、没有任何断点', () => {
    expect(boardLayout([0, 0, 0], 1)).toEqual([
      { index: 0, breakBefore: false, trailing: false },
      { index: 1, breakBefore: false, trailing: false },
      { index: 2, breakBefore: false, trailing: true },
    ]);
  });

  it('分配越界 / 非整数时夹回合法列（脏输入不许把卡片藏起来）', () => {
    const slots = boardLayout([0, 7, -1], 2);
    expect(slots.map((slot) => slot.index).sort()).toEqual([0, 1, 2]);
    expect(slots).toHaveLength(3);
  });
});

describe('boardImproves', () => {
  it('只在「真的更平」且收益 ≥32px 时才值得换列；换过之后不会再被换回去（不来回抖）', () => {
    expect(boardImproves([0, 1, 0], [0, 1, 1], [1050, 700, 400], 2)).toBe(true);
    expect(boardImproves([0, 1, 1], [0, 1, 0], [1050, 700, 400], 2)).toBe(false);
    expect(boardImproves([0, 1, 0], [0, 1, 1], [200, 200, 210], 2)).toBe(false);
  });

  it('候选与现状一样时不换；张数对不上（还没量齐）时按「该换」处理', () => {
    expect(boardImproves([0, 1], [0, 1], [100, 200], 2)).toBe(false);
    expect(boardImproves([0], [0, 1], [100, 200], 2)).toBe(true);
  });
});
