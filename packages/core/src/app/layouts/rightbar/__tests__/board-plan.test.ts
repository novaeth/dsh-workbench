import { describe, expect, it } from 'vitest';
import type { BoardModule } from '@dsh-workbench/shared';
import { planBoard, type BoardShape } from '../board-plan';

function module(id: string): BoardModule {
  return { id, titleKey: id, order: 1, View: () => null };
}

const A = module('issues');
const B = module('builds');
const ALL: readonly BoardModule[] = [A, B];

describe('planBoard', () => {
  it('real：原样照搬（顺序不变、key 就是 id），不做任何加工', () => {
    const plan = planBoard({ kind: 'real' }, { modules: [B, A], configRead: true }, ALL);

    expect(plan.modules.map((entry) => entry.key)).toEqual(['builds', 'issues']);
    expect(plan.modules.map((entry) => entry.module)).toEqual([B, A]);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(false);
    expect(plan.repeated).toBe(false);
  });

  it('real + 配置读到了 + 一个模块都没开 → 摆空态', () => {
    const plan = planBoard({ kind: 'real' }, { modules: [], configRead: true }, ALL);

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(true);
    expect(plan.reading).toBe(false);
  });

  it('★ real + 配置**还没读到** → 不摆空态，改说"在读"（"没读到"不是"没有"）', () => {
    const plan = planBoard({ kind: 'real' }, { modules: [], configRead: false }, ALL);

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(true);
  });

  it('empty：不摆卡、摆空态 —— 哪怕真实配置里开着好几个', () => {
    const plan = planBoard({ kind: 'empty' }, { modules: [A, B], configRead: true }, ALL);

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(true);
  });

  it('★ unread：不摆卡、不说"一个模块都没有"，只说"在读"', () => {
    const plan = planBoard({ kind: 'unread' }, { modules: [A, B], configRead: true }, ALL);

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(true);
  });

  it('★ "在读"与"空"永远不会同时出现（两种说法互斥）', () => {
    const shapes: readonly BoardShape[] = [
      { kind: 'real' },
      { kind: 'empty' },
      { kind: 'unread' },
      { kind: 'kit' },
      { kind: 'all' },
      { kind: 'copies', count: 2 },
    ];

    for (const shape of shapes) {
      for (const configRead of [true, false]) {
        const plan = planBoard(shape, { modules: [], configRead }, ALL);

        expect(plan.reading && plan.empty, `${shape.kind}/${String(configRead)}`).toBe(false);
      }
    }
  });

  it('copies：同一个模块摆 n 份，key 各不相同（拿 id 当 key 会丢卡）', () => {
    const plan = planBoard({ kind: 'copies', count: 3 }, { modules: [A], configRead: true }, ALL);

    expect(plan.modules).toHaveLength(3);
    expect(plan.modules.map((entry) => entry.module)).toEqual([A, A, A]);
    expect(new Set(plan.modules.map((entry) => entry.key)).size).toBe(3);
    expect(plan.repeated).toBe(true);
  });

  it('copies 只摆一份时不算"重复"（卡片夹具条该留着）', () => {
    const plan = planBoard({ kind: 'copies', count: 1 }, { modules: [], configRead: true }, ALL);

    expect(plan.modules).toHaveLength(1);
    expect(plan.repeated).toBe(false);
  });

  it('copies 而注册表里一个模块都没有 → 不摆（不编一个不存在的模块）', () => {
    const plan = planBoard({ kind: 'copies', count: 6 }, { modules: [], configRead: true }, []);

    expect(plan.modules).toEqual([]);
    expect(plan.empty).toBe(false);
  });

  it('copies 的份数是 0 或负数时退化成不摆', () => {
    expect(planBoard({ kind: 'copies', count: 0 }, { modules: [A], configRead: true }, ALL).modules).toEqual([]);
    expect(planBoard({ kind: 'copies', count: -2 }, { modules: [A], configRead: true }, ALL).modules).toEqual([]);
  });

  it('★ all：把注册表原样摆出来（崩溃夹具靠它把坏卡与好卡摆在同一屏）', () => {
    const plan = planBoard({ kind: 'all' }, { modules: [], configRead: true }, [B, A]);

    expect(plan.modules.map((entry) => entry.key)).toEqual(['builds', 'issues']);
    expect(plan.modules.map((entry) => entry.module)).toEqual([B, A]);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(false);
    expect(plan.repeated).toBe(true);
  });

  it('all 只有一张时不算"重复"、注册表空时也不摆空态', () => {
    expect(planBoard({ kind: 'all' }, { modules: [], configRead: true }, [A]).repeated).toBe(false);
    expect(planBoard({ kind: 'all' }, { modules: [A], configRead: false }, []).modules).toEqual([]);
  });
});
