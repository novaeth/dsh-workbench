import { describe, expect, it } from 'vitest';
import { createForcePlan } from '../force-plan';

describe('createForcePlan', () => {
  it('平时那一拍什么都不带（宿主那边跟着正在跑的那一轮、刚 ready 的直接回上一次）', () => {
    const plan = createForcePlan();

    expect(plan.next()).toEqual({});
    expect(plan.next()).toEqual({});
    expect(plan.next()).toEqual({});
  });

  it('知道是哪一步出问题时，重试只从那一步开始（only=bridge），不再整条重跑', () => {
    const plan = createForcePlan();
    plan.next();

    plan.again('bridge');

    expect(plan.next()).toEqual({ only: 'bridge' });
    expect(plan.next()).toEqual({});
  });

  it('说不出是哪一步（比如整条都崩了）才退回 hard=1', () => {
    const plan = createForcePlan();
    plan.next();
    plan.next();

    plan.again();

    expect(plan.next()).toEqual({ hard: 1 });
    expect(plan.next()).toEqual({});
  });
});
