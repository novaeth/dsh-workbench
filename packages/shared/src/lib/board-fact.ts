/**
 * 椅面（右栏那块画板）此刻归属哪一类：`workshop` 本工坊、`other` 别家、`hidden` 没画出来、`unknown` 探不到。
 */
export type BoardFactState =
  | 'workshop'
  | 'other'
  | 'hidden'
  | 'unknown';

/**
 * 左栏底部「调试」那条状态要说的档位：`ok` 在板上、`off-workspace` 切去了别的项目、`panel-closed` 面板没开、`other-board` 画的是别家的板、`unknown` 探不到。
 */
export type BoardSituation =
  | 'ok'
  | 'off-workspace'
  | 'panel-closed'
  | 'other-board'
  | 'unknown';

/**
 * 一次页面探针的读数：外壳在不在、探的是哪个工作区、右栏开没开、板上挂的路径、椅面画出来没有。
 */
export interface BoardProbe {
  readonly workbench: boolean;
  readonly where: string;
  readonly bar: boolean;
  readonly board: string;
  readonly open: boolean;
  readonly drawn: boolean;
}

/**
 * 判一个路径落不落在这个工作区里（按路径前缀比，不是字符串包含）。
 * @param root - 工作区根路径。
 * @param target - 要判的路径。
 * @returns 同一个路径或在其下给 `true`；`root` 末尾带不带斜杠都认（`/a` 不匹配 `/ab`）。
 */
export function insideWorkshop(root: string, target: string): boolean {
  if (target === root) return true;
  const base = root.endsWith('/') ? root : `${root}/`;
  return target.startsWith(base);
}

/**
 * 把探针读数归成左栏那句人话的档位。
 * @param probe - 探针读数。
 * @param workshop - 当前工作区根路径；`null` 一律 `unknown`。
 * @returns 椅面画着 → 本板 `ok` / 别板 `other-board`；没画着 → 页面已走 `off-workspace`，否则 `panel-closed`。
 */
export function boardSituation(probe: BoardProbe, workshop: string | null): BoardSituation {
  if (!probe.workbench || workshop === null) return 'unknown';
  const drawn = probe.bar && probe.open && probe.drawn;
  if (drawn) {
    if (probe.board === '') return 'unknown';
    return insideWorkshop(workshop, probe.board) ? 'ok' : 'other-board';
  }
  if (probe.where !== '' && !insideWorkshop(workshop, probe.where)) return 'off-workspace';
  return 'panel-closed';
}
