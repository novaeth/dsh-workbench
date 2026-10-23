import { describe, expect, it } from 'vitest';
import type { UnitModuleFace } from '@dsh-workbench/shared/host';
import { createFactLog } from '@dsh-workbench/shared/host';
import { factOfRoute } from '@dsh-workbench/shared';
import { UNIT_MANIFESTS_ROUTE } from '@/shared/api/unit-manifests';
import { createUnitRegistry } from '../unit-registry';
import { bindRosterFacts } from '../unit-roster-facts';

function declaration(unit: string): unknown {
  return {
    apiVersion: 1,
    unit,
    card: null,
    tools: [],
    host: { inject: [] },
  };
}

function registryOf(known: readonly string[] = ['issues', 'inventory']) {
  return createUnitRegistry({
    declarationOf: (unit) =>
      known.includes(unit) ? { pkg: `@t/module-${unit}`, declaration: declaration(unit) } : undefined,
  });
}

function face(unit: string): UnitModuleFace {
  return { unit, mount: () => ({ routes: {}, registerTools: () => [] }) };
}

function ledger(): { facts: ReturnType<typeof createFactLog>; seen: string[][] } {
  const facts = createFactLog();
  const seen: string[][] = [];
  facts.subscribe((change) => seen.push([...change.facts]));
  return { facts, seen };
}

describe('花名册 → 事实账本', () => {
  it('★ 注册一个单元就记一笔：花名册变了（装一个模块 = 浏览器那半要重读清单）', () => {
    const { facts, seen } = ledger();
    const units = registryOf();
    bindRosterFacts({ units, bump: (names) => facts.bump(names) });

    units.register(face('issues'));

    expect(seen).toEqual([['unit-manifests']]);
    expect(facts.revision()).toBe(1);
  });

  it('★ 卸载一个单元也记一笔（浏览器那半不刷新页面也看得见卡片被摘）', () => {
    const { facts, seen } = ledger();
    const units = registryOf();
    bindRosterFacts({ units, bump: (names) => facts.bump(names) });
    const dispose = units.register(face('issues'));

    dispose();

    expect(seen).toEqual([['unit-manifests'], ['unit-manifests']]);
    expect(facts.revision()).toBe(2);
  });

  it('★ 记的那条事实名就是浏览器读缝订的那条（宿主与浏览器两端说的是同一个名字）', () => {
    const { facts, seen } = ledger();
    const units = registryOf();
    bindRosterFacts({ units, bump: (names) => facts.bump(names) });

    units.register(face('inventory'));

    expect(seen[0]).toEqual([factOfRoute(UNIT_MANIFESTS_ROUTE)]);
  });

  it('★ 花名册没变就不记：拒因、重复 id、重复注销都不算变化', () => {
    const { facts, seen } = ledger();
    const units = registryOf();
    bindRosterFacts({ units, bump: (names) => facts.bump(names) });

    units.register(face('ghost'));
    units.register(face('   '));
    expect(seen).toEqual([]);

    units.register(face('issues'));
    expect(() => units.register(face('issues'))).toThrow(/重复/);
    expect(seen).toEqual([['unit-manifests']]);

    const dispose = units.register(face('inventory'));
    dispose();
    expect(seen).toHaveLength(3);

    dispose();
    expect(seen).toHaveLength(3);
    expect(facts.revision()).toBe(3);
  });

  it('绑定之前就已经在花名册里的单元不算变化（只有它之后的注册才记一笔）', () => {
    const { facts, seen } = ledger();
    const units = registryOf();
    units.register(face('issues'));

    bindRosterFacts({ units, bump: (names) => facts.bump(names) });

    expect(seen).toEqual([]);
    expect(facts.revision()).toBe(0);

    units.register(face('inventory'));
    expect(seen).toEqual([['unit-manifests']]);
  });
});
