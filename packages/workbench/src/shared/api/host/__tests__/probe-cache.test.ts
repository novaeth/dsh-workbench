import { describe, expect, it } from 'vitest';
import { createTimedMemo } from '../probe-cache';

describe('createTimedMemo', () => {
  it('保鲜期内命中（同一条 key 不重算）', () => {
    const memo = createTimedMemo<number>(30_000);
    memo.set('a', 1, 1_000);

    expect(memo.get('a', 1_000)).toBe(1);
    expect(memo.get('a', 30_999)).toBe(1);
  });

  it('★ 到点即过期：旧的结论不许永远作数', () => {
    const memo = createTimedMemo<number>(30_000);
    memo.set('a', 1, 1_000);

    expect(memo.get('a', 31_000)).toBeUndefined();
  });

  it('没记过的 key → `undefined`（"没结论"与"结论是 undefined"不混）', () => {
    const memo = createTimedMemo<number>(30_000);

    expect(memo.get('never', 1_000)).toBeUndefined();
  });

  it('再记一次会盖掉旧结论，并**重新计时**', () => {
    const memo = createTimedMemo<number>(30_000);
    memo.set('a', 1, 1_000);
    memo.set('a', 2, 20_000);

    expect(memo.get('a', 49_999)).toBe(2);
    expect(memo.get('a', 50_000)).toBeUndefined();
  });

  it('`clear()` 之后一律当没记过（机器刚被改过就走这条）', () => {
    const memo = createTimedMemo<number>(30_000);
    memo.set('a', 1, 1_000);
    memo.clear();

    expect(memo.get('a', 1_001)).toBeUndefined();
  });
});
