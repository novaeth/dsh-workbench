import { describe, expect, it } from 'vitest';
import { createValueHandoff, handoffId, type HandoffEntry } from '@dsh-workbench/shared/host';

const ENTRY: HandoffEntry = { fact: 'analysis/summary', key: 'path:/w/web' };

function desk(options: { ttlMs?: number } = {}) {
  return createValueHandoff(options);
}

describe('handoffId', () => {
  it('事实与键各占一格：事实的长度先写下来，所以键里有什么字符都不会串到别的事实上', () => {
    expect(handoffId({ fact: 'a', key: 'b\u0000c' })).not.toBe(handoffId({ fact: 'a\u0000b', key: 'c' }));
    expect(handoffId(ENTRY)).toBe(handoffId({ fact: ENTRY.fact, key: ENTRY.key }));
  });
});

describe('createValueHandoff', () => {
  it('★ 交出去的值会被领走（事实的记账不在这里：那是套件声明 + 外壳推的）', () => {
    const handoff = desk();

    handoff.hand(ENTRY, { counts: 1 }, 1000);

    expect(handoff.take(ENTRY, 1001)).toEqual({ value: { counts: 1 }, at: 1000 });
  });

  it('★ 只服务一次：第二个读者领不到，只能自己去读', () => {
    const handoff = desk();

    handoff.hand(ENTRY, '一次', 1000);

    expect(handoff.take(ENTRY, 1000)).toEqual({ value: '一次', at: 1000 });
    expect(handoff.take(ENTRY, 1000)).toBeUndefined();
  });

  it('★ 超过上限时间就不认（面板没开时，那份值不会在几分钟后被领走）—— 而且照样算领过', () => {
    const handoff = desk({ ttlMs: 15_000 });

    handoff.hand(ENTRY, '旧值', 1000);

    expect(handoff.take(ENTRY, 16_000)).toBeUndefined();
    expect(handoff.take(ENTRY, 16_001)).toBeUndefined();
  });

  it('上限是"小于才算"：差一毫秒还认，正好到点就不认', () => {
    const handoff = desk({ ttlMs: 10 });

    handoff.hand(ENTRY, '卡点', 0);
    handoff.hand(ENTRY, '卡点', 0);

    expect(handoff.take(ENTRY, 9)).toEqual({ value: '卡点', at: 0 });
    expect(handoff.take(ENTRY, 10)).toBeUndefined();
  });

  it('不同键 / 不同事实各走各的：另一个项目、另一条投影都不许领走别人的值', () => {
    const handoff = desk();
    const other: HandoffEntry = { fact: 'analysis/summary', key: 'path:/w/other' };
    const anotherFact: HandoffEntry = { fact: 'inventory/summary', key: 'path:/w/web' };

    handoff.hand(ENTRY, 'web', 1000);

    expect(handoff.take(other, 1000)).toBeUndefined();
    expect(handoff.take(anotherFact, 1000)).toBeUndefined();
    expect(handoff.take(ENTRY, 1000)).toEqual({ value: 'web', at: 1000 });
  });

  it('没人交过 → 领不到', () => {
    expect(desk().take(ENTRY, 1000)).toBeUndefined();
  });

  it('同一个键再交一次：后交的覆盖先交的（那是更新的那次对话）', () => {
    const handoff = desk();

    handoff.hand(ENTRY, '第一次', 1000);
    handoff.hand(ENTRY, '第二次', 2000);

    expect(handoff.take(ENTRY, 2000)).toEqual({ value: '第二次', at: 2000 });
    expect(handoff.take(ENTRY, 2000)).toBeUndefined();
  });
});
