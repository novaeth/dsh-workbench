import { describe, expect, it } from 'vitest';
import { createForcePlan } from '../boot-gate';

describe('createForcePlan', () => {
  it('平时那一拍什么都不带（宿主那边跟着正在跑的那一轮、刚 ready 的直接回上一次）', () => {
    const plan = createForcePlan();

    expect(plan.next()).toEqual({});
    expect(plan.next()).toEqual({});
    expect(plan.next()).toEqual({});
  });

  it('点重试之后的那一拍带 hard=1，再之后就回什么都不带', () => {
    const plan = createForcePlan();
    plan.next();
    plan.next();

    plan.again();

    expect(plan.next()).toEqual({ hard: 1 });
    expect(plan.next()).toEqual({});
  });
});
