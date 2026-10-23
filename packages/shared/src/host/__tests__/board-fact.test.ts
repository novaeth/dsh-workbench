import { describe, expect, it } from 'vitest';
import type { BoardProbe } from '../../lib/board-fact.js';
import { boardFactOf } from '../board-fact.js';

const WORKSHOP = '/w/workbench/diy';

const probe = (over: Partial<BoardProbe> = {}): BoardProbe => ({
  workbench: true,
  where: WORKSHOP,
  bar: true,
  board: WORKSHOP,
  open: true,
  drawn: true,
  ...over,
});

describe('板事实：一份判据，两边共用', () => {
  it('★★ 画着的就是工坊那块板（含子路径）⇒ workshop', () => {
    expect(boardFactOf(probe(), WORKSHOP)).toBe('workshop');
    expect(boardFactOf(probe({ board: `${WORKSHOP}/packages` }), WORKSHOP)).toBe('workshop');
  });

  it('★★ 画的是别的项目的板 ⇒ other（前缀像但没落在里面也算 other）', () => {
    expect(boardFactOf(probe({ board: '/w/project' }), WORKSHOP)).toBe('other');
    expect(boardFactOf(probe({ board: `${WORKSHOP}-other` }), WORKSHOP)).toBe('other');
  });

  it('★★ 那块板没画在屏上 ⇒ hidden：不挂、没声明开着、量出来不可见，三条里任一条不成立都算', () => {
    expect(boardFactOf(probe({ bar: false }), WORKSHOP)).toBe('hidden');
    expect(boardFactOf(probe({ open: false }), WORKSHOP)).toBe('hidden');
    expect(boardFactOf(probe({ drawn: false }), WORKSHOP)).toBe('hidden');
  });

  it('★★ 工作台没答话（旧外壳 / 夹具页）⇒ unknown：放行，但不许当成"就是工坊板"', () => {
    expect(boardFactOf(probe({ workbench: false }), WORKSHOP)).toBe('unknown');
  });

  it('★ 画着板但说不清是哪块、或不知道工坊在哪 ⇒ unknown', () => {
    expect(boardFactOf(probe({ board: '' }), WORKSHOP)).toBe('unknown');
    expect(boardFactOf(probe(), null)).toBe('unknown');
  });

  it('★★ 顺序要紧：没画在屏上，就别去猜是哪块板', () => {
    expect(boardFactOf(probe({ board: WORKSHOP, drawn: false }), WORKSHOP)).toBe('hidden');
    expect(boardFactOf(probe({ workbench: false, bar: false }), WORKSHOP)).toBe('unknown');
  });
});
