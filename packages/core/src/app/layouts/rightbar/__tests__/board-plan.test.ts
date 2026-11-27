import { describe, expect, it } from 'vitest';
import type { BoardModule } from '@dsh-workbench/shared';
import { planBoard } from '../board-plan';

function module(id: string): BoardModule {
  return { id, titleKey: id, order: 1, View: () => null };
}

const A = module('issues');
const B = module('builds');

describe('planBoard', () => {
  it('原样照搬（顺序不变、key 就是 id），不做任何加工', () => {
    const plan = planBoard({ modules: [B, A], configRead: true });

    expect(plan.modules.map((entry) => entry.key)).toEqual(['builds', 'issues']);
    expect(plan.modules.map((entry) => entry.module)).toEqual([B, A]);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(false);
  });

  it('配置读到了 + 一个模块都没开 → 摆空态', () => {
    const plan = planBoard({ modules: [], configRead: true });

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(true);
    expect(plan.reading).toBe(false);
  });

  it('★ 配置还没读到 → 不摆空态，改说「在读」（「没读到」不是「没有」）', () => {
    const plan = planBoard({ modules: [], configRead: false });

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(true);
  });

  it('★ 读失败：别说空态、也别说在读，交给那张失败卡', () => {
    const plan = planBoard({ modules: [], configRead: false, configFailed: true });

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(false);
    expect(plan.readFailed).toBe(true);
  });

  it('★ 「在读」与「空」永远不会同时出现（两种说法互斥）', () => {
    for (const read of [true, false]) {
      const plan = planBoard({ modules: [], configRead: read });
      expect(plan.empty && plan.reading).toBe(false);
    }
  });
});
