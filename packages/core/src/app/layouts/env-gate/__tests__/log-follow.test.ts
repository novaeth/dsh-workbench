import { describe, expect, it } from 'vitest';
import { logAtBottom } from '../log-follow';

const viewport = (scrollTop: number, scrollHeight: number, clientHeight: number) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe('预检日志是否该跟着滚底', () => {
  it('内容没超过可视区：一直算在底（没有可滚的地方，跟不跟随都一样）', () => {
    expect(logAtBottom(viewport(0, 200, 300))).toBe(true);
    expect(logAtBottom(viewport(0, 300, 300))).toBe(true);
  });

  it('贴着底 / 在容差内算在底', () => {
    expect(logAtBottom(viewport(500, 800, 300))).toBe(true);
    expect(logAtBottom(viewport(499, 800, 300))).toBe(true);
  });

  it('★ 用户往上翻走之后不在底：这时候不许再把它拽回去', () => {
    expect(logAtBottom(viewport(0, 800, 300))).toBe(false);
    expect(logAtBottom(viewport(400, 800, 300))).toBe(false);
  });

  it('翻回底部附近自动恢复跟随', () => {
    expect(logAtBottom(viewport(498, 800, 300))).toBe(true);
  });
});
