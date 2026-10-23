import type { ModuleBlocker } from './blocker.js';

/**
 * 卡片闸的两种档：capability 按环境读数判，none 无条件放行。
 */
export type GateMode =
  | 'capability'
  | 'none';

/**
 * 一次放行判定的结果；gated 为假时卡片不画。
 */
export interface UnitGate {
  readonly gated: boolean;
}

/**
 * 一个单元攒下的卡住态：blocker 顶掉卡片，notice 只提示；组装方产出，卡片消费。
 */
export interface UnitBlockers {
  readonly blocker?: ModuleBlocker;
  readonly notice?: ModuleBlocker;
}
