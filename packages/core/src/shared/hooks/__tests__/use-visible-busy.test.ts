import { describe, expect, it } from 'vitest';
import { busyView, heldPhase } from '../use-visible-busy';

describe('busyView', () => {
  it('★ 读还在飞：只是忙（慢读 6 秒也不许演"读取中"那一屏）', () => {
    expect(busyView(true, true)).toEqual({ busy: true, settling: false });
  });

  it('★ 读一瞬间就回来了、下限还在按：这才是"刚同步完的那一下"（body 出已有的加载态）', () => {
    expect(busyView(false, true)).toEqual({ busy: true, settling: true });
  });

  it('没开过 / 按完收工：既不忙也不结算', () => {
    expect(busyView(false, false)).toEqual({ busy: false, settling: false });
    expect(busyView(true, false)).toEqual({ busy: false, settling: false });
  });
});

describe('heldPhase', () => {
  it('★ 下限还在按住时，刚到手的 ready 要说成 loading（body 照旧演已有的加载态，不闪一帧）', () => {
    expect(heldPhase('ready', true)).toBe('loading');
  });

  it('下限按住，但这一份还没到手 → 本来就是 loading，不变', () => {
    expect(heldPhase('loading', true)).toBe('loading');
  });

  it('★ 错误立刻给，不盖：按住也不许把 error 说成 loading（那是把失败藏 500ms）', () => {
    expect(heldPhase('error', true)).toBe('error');
  });

  it('没有在按（懒的那一档、慢读结束之后）→ 原样', () => {
    expect(heldPhase('ready', false)).toBe('ready');
    expect(heldPhase('idle', false)).toBe('idle');
  });
});
