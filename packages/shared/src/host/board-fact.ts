import { insideWorkshop, type BoardFactState, type BoardProbe } from '../lib/board-fact.js';

/**
 * 把一次探针读数归成椅面归属。
 * @param probe - 探针读数。
 * @param workshop - 当前工作区根路径；`null` 表示还不知道当前是哪个工作区。
 * @returns 外壳不在、或板路径与工作区缺一 → `unknown`；右栏没开或没画出来 → `hidden`；板在本工作区 → `workshop`，否则 `other`。
 */
export function boardFactOf(probe: BoardProbe, workshop: string | null): BoardFactState {
  if (!probe.workbench) return 'unknown';
  if (!probe.bar || !probe.open || !probe.drawn) return 'hidden';
  if (probe.board === '' || workshop === null) return 'unknown';
  return insideWorkshop(workshop, probe.board) ? 'workshop' : 'other';
}
