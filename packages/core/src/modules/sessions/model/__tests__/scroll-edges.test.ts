import { describe, expect, it } from 'vitest';
import { scrollEdgesOf } from '../scroll-edges';

const metrics = (scrollTop: number, scrollHeight: number, clientHeight: number) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe('scrollEdgesOf：滚动区的两端还能不能滚', () => {
  it('在顶上：上端不给淡出、下端给（内容确实更长）', () => {
    expect(scrollEdgesOf(metrics(0, 1000, 300))).toEqual({ canScrollUp: false, canScrollDown: true });
  });

  it('滚到中间：两端都给', () => {
    expect(scrollEdgesOf(metrics(350, 1000, 300))).toEqual({ canScrollUp: true, canScrollDown: true });
  });

  it('★ 滚到底（含容差 1px）：下端不给、上端给', () => {
    expect(scrollEdgesOf(metrics(700, 1000, 300))).toEqual({ canScrollUp: true, canScrollDown: false });
    expect(scrollEdgesOf(metrics(699, 1000, 300))).toEqual({ canScrollUp: true, canScrollDown: false });
  });

  it('★ 容差之内不算"还能滚"（否则到头了还挂着一层淡出）', () => {
    expect(scrollEdgesOf(metrics(1, 1000, 300)).canScrollUp).toBe(false);
    expect(scrollEdgesOf(metrics(2, 1000, 300)).canScrollUp).toBe(true);
  });

  it('内容比视口短：两端都不给（一行都不用滚）', () => {
    expect(scrollEdgesOf(metrics(0, 200, 300))).toEqual({ canScrollUp: false, canScrollDown: false });
    expect(scrollEdgesOf(metrics(0, 300, 300))).toEqual({ canScrollUp: false, canScrollDown: false });
  });
});
