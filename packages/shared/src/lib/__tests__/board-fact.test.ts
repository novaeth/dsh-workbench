import { describe, expect, it } from 'vitest';
import { boardSituation, insideWorkshop, type BoardProbe } from '../board-fact.js';

const WORKSHOP = '/w/workbench/diy';
const FL0XIN = '/w/floxin-app';

const probe = (over: Partial<BoardProbe> = {}): BoardProbe => ({
  workbench: true,
  where: WORKSHOP,
  bar: true,
  board: WORKSHOP,
  open: true,
  drawn: true,
  ...over,
});

const gone = { bar: false, board: '', open: false, drawn: false } as const;

describe('干不了活是为什么：先看人在不在工坊，再看板画没画在屏上', () => {
  it('★★ 在位 ⇒ ok（跟 boardFactOf === "workshop" 是同一个条件）', () => {
    expect(boardSituation(probe(), WORKSHOP)).toBe('ok');
    expect(boardSituation(probe({ board: `${WORKSHOP}/packages` }), WORKSHOP)).toBe('ok');
  });

  it('★★ 用户根本不在工坊那个工作区 ⇒ off-workspace（哪怕右栏整个没挂也说得清）', () => {
    expect(boardSituation(probe({ where: FL0XIN, ...gone }), WORKSHOP)).toBe('off-workspace');
    expect(boardSituation(probe({ where: FL0XIN }), WORKSHOP)).toBe('ok');
  });

  it('★★ 人在工坊、可那块板没画在屏上 ⇒ panel-closed', () => {
    expect(boardSituation(probe({ ...gone }), WORKSHOP)).toBe('panel-closed');
  });

  it('★★ 人在工坊、画着的却是别家的板 ⇒ other-board', () => {
    expect(boardSituation(probe({ board: '/w/project' }), WORKSHOP)).toBe('other-board');
  });

  it('★ 问不出来（旧外壳 / 夹具页）⇒ unknown：两边都放行、都别喊狼来了', () => {
    expect(boardSituation(probe({ workbench: false }), WORKSHOP)).toBe('unknown');
    expect(boardSituation(probe({ where: '', ...gone }), WORKSHOP)).toBe('panel-closed');
    expect(boardSituation(probe({ board: '' }), WORKSHOP)).toBe('unknown');
  });

  it('★★ 优先级：不在工坊这一条压过"面板没开"（先说更根本的那一步）', () => {
    expect(boardSituation(probe({ where: FL0XIN, ...gone }), WORKSHOP)).toBe('off-workspace');
  });

  it('★ 路径归属的纯规则：相同就是里面，前缀必须落在斜杠上', () => {
    expect(insideWorkshop('/a/b', '/a/b')).toBe(true);
    expect(insideWorkshop('/a/b', '/a/b/c')).toBe(true);
    expect(insideWorkshop('/a/b', '/a/bc')).toBe(false);
    expect(insideWorkshop('/a/b/', '/a/b/c')).toBe(true);
  });
});
