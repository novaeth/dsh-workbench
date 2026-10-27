import { describe, expect, it } from 'vitest';
import { holdBusy } from './busy.js';

describe('holdBusy', () => {
  it('这一轮忙刚开了头：还要按住，剩下的时长报出来（计时器按它收尾）', () => {
    expect(holdBusy(1000, 1000, 500)).toEqual({ visible: true, releaseInMs: 500 });
    expect(holdBusy(1000, 1200, 500)).toEqual({ visible: true, releaseInMs: 300 });
    expect(holdBusy(1000, 1499, 500)).toEqual({ visible: true, releaseInMs: 1 });
  });

  it('★ 差一毫秒还按住，正好到点就放 —— 下限是"至少看这么久"', () => {
    expect(holdBusy(1000, 1499, 500).visible).toBe(true);
    expect(holdBusy(1000, 1500, 500)).toEqual({ visible: false, releaseInMs: 0 });
  });

  it('慢读（本来就超过下限）一下都不多按：真实时长说了算', () => {
    expect(holdBusy(1000, 7000, 500)).toEqual({ visible: false, releaseInMs: 0 });
  });

  it('没开过这一轮忙 → 什么都不按（挂载第一帧、enabled=false 的那些读者）', () => {
    expect(holdBusy(null, 1000, 500)).toEqual({ visible: false, releaseInMs: 0 });
  });

  it('时钟倒退（now 比开头还早）按"刚开头"算，不出现负的剩余时长', () => {
    expect(holdBusy(1000, 900, 500)).toEqual({ visible: true, releaseInMs: 500 });
  });
});
