import { describe, expect, it } from 'vitest';
import type { MarketRow } from '../market-row-types';
import { marketOrder } from '../market-rows';

describe('marketOrder', () => {
  const line = (id: string, titleKey: string): MarketRow => ({
    id,
    titleKey,
    state: 'installed',
    canInstall: false,
    canUpdate: false,
    canUninstall: true,
  });

  it('★ 显示顺序与"这一行从哪份名单来"无关：同一批行、两种输入顺序 → 同一个序', () => {
    const lines = [line('delivery', 'delivery.mine'), line('inventory', '构建发布'), line('issues', '缺陷看板')];
    const titleOf = (row: MarketRow): string => row.titleKey;

    expect(marketOrder(lines, titleOf).map((row) => row.id)).toEqual(
      marketOrder([...lines].reverse(), titleOf).map((row) => row.id),
    );
  });

  it('★ 按用户看见的那个名字排（中文按拼音），同名时用 id 兜底', () => {
    const lines = [line('issues', '缺陷看板'), line('inventory', '构建发布'), line('delivery', '代码分析')];
    const titleOf = (row: MarketRow): string => row.titleKey;

    expect(marketOrder(lines, titleOf).map((row) => row.id)).toEqual(['delivery', 'inventory', 'issues']);

    const tied = [line('b', '同名'), line('a', '同名')];
    expect(marketOrder(tied, titleOf).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('只重排，不改内容', () => {
    const lines = [line('b', '乙'), line('a', '甲')];
    const ordered = marketOrder(lines, (row) => row.titleKey);

    expect(ordered).toHaveLength(2);
    expect(ordered[0]).toBe(lines[1]);
    expect(lines.map((row) => row.id)).toEqual(['b', 'a']);
  });
});
