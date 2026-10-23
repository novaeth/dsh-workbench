import { clockOf } from './time.js';
/**
 * 调试约定的两个相位：`debugging` 正占着用户的屏，`paused` 已暂停但仍持着约定。
 */
export type DebugPhase = 'debugging' | 'paused';

/**
 * 调试约定收得下的三个人话动作：暂停 / 继续 / 结束。
 */
export type DebugIntent = 'pause' | 'resume' | 'stop';

/**
 * 把工具入参收成人话动作。
 * @param value - 任意入参值。
 * @returns `'pause'` / `'resume'` / `'stop'` 原样；别的值（含 `undefined`、多余空白、大小写不同）给 `null`，由调用方拒。
 */
export function parseDebugIntent(value: unknown): DebugIntent | null {
  return value === 'pause' || value === 'resume' || value === 'stop' ? value : null;
}

/**
 * 调试约定的有效期（4 小时，毫秒）：超过它没动静的约定算过期、当场让人。
 */
export const DEBUG_STALE_MS = 4 * 60 * 60 * 1000;

/**
 * 一份活着的调试约定：相位 + 谁的会话 + 哪个工作区 / 板 / 单元 + 起于何时（`at` 是最后一次动作）。
 */
export interface DebugState {
  readonly phase: DebugPhase;
  readonly sessionId: string;
  readonly workspacePath: string;
  readonly title: string;
  readonly board: string;
  readonly unit: string;
  readonly name: string;
  readonly startedAt: number;
  readonly at: number;
}

/**
 * 建立约定要交的那几件：会话、工作区、板、单元、名字，以及此刻的时间戳。
 */
export interface DebugPact {
  readonly sessionId: string;
  readonly workspacePath: string;
  readonly title: string;
  readonly board: string;
  readonly unit: string;
  readonly name: string;
  readonly now: number;
}

/**
 * 约定被拒的原因码：自己已持有 / 别人持着 / 不是持有者 / 没有约定 / 已暂停 / 已在调试。
 */
export type DebugRefusal =
  | 'already-held'
  | 'held-by-other'
  | 'not-owner'
  | 'none'
  | 'already-paused'
  | 'already-debugging';

/**
 * 一次约定动作的结果：成功带新状态，失败带拒绝码。
 */
export type DebugMove =
  | { readonly ok: true; readonly state: DebugState }
  | { readonly ok: false; readonly code: DebugRefusal };

/**
 * 调试约定的存取口（外壳持有一份）：`live` 取当前有效的约定，`begin` / `pause` / `resume` / `stop` 推相位。
 */
export interface DebugStore {
  live(now: number): DebugState | null;
  begin(pact: DebugPact): DebugMove;
  pause(sessionId: string, now: number): DebugMove;
  resume(sessionId: string, now: number): DebugMove;
  stop(sessionId: string, now: number): DebugMove;
  settle?(): Promise<void>;
}

function alive(state: DebugState | null, now: number): DebugState | null {
  if (state === null) return null;
  return now - state.at <= DEBUG_STALE_MS ? state : null;
}

function ownerOf(state: DebugState | null, sessionId: string, now: number): DebugRefusal | DebugState {
  const held = alive(state, now);
  if (held === null) return 'none';
  return held.sessionId === sessionId ? held : 'not-owner';
}

/**
 * 造一份新的调试约定存储（进程内存，同一时刻只可能有一份有效约定）。
 * @returns 存取口；动作成不成都在返回的 `DebugMove` 里，不抛异常。
 */
export function createDebugStore(): DebugStore {
  let held: DebugState | null = null;

  const live = (now: number): DebugState | null => alive(held, now);

  return {
    live,

    begin(pact) {
      const current = alive(held, pact.now);
      if (current !== null) {
        return { ok: false, code: current.sessionId === pact.sessionId ? 'already-held' : 'held-by-other' };
      }
      const state: DebugState = {
        phase: 'debugging',
        sessionId: pact.sessionId,
        workspacePath: pact.workspacePath,
        title: pact.title,
        board: pact.board,
        unit: pact.unit,
        name: pact.name,
        startedAt: pact.now,
        at: pact.now,
      };
      held = state;
      return { ok: true, state };
    },

    pause(sessionId, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      if (found.phase === 'paused') return { ok: false, code: 'already-paused' };
      const state: DebugState = { ...found, phase: 'paused', at: now };
      held = state;
      return { ok: true, state };
    },

    resume(sessionId, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      if (found.phase === 'debugging') return { ok: false, code: 'already-debugging' };
      const state: DebugState = { ...found, phase: 'debugging', at: now };
      held = state;
      return { ok: true, state };
    },

    stop(sessionId, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      held = null;
      return { ok: true, state: found };
    },
  };
}

/**
 * 「谁还占着」的一句话，用于别人来抢时说清现况。
 * @param state - 当前有效的那份约定。
 * @returns 形如「会话 x（自 HH:mm:ssZ 起在调试 y）」的中文串。
 */
export function debugOwnerText(state: DebugState): string {
  return `会话 ${state.sessionId}（自 ${clockOf(state.startedAt)}Z 起在调试 ${state.unit}）`;
}
