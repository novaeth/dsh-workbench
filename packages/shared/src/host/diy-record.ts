import { clockOf } from './time.js';
/**
 * 录制交接的三个相位：`armed` 等用户在外站页面上动手，`recording` 正在录，`finished` 录完待取。
 */
export type RecordPhase = 'armed' | 'recording' | 'finished';

/**
 * 录制约定的有效期（15 分钟，毫秒）：超过它没动静的约定算过期、当场让人。
 */
export const RECORD_STALE_MS = 15 * 60 * 1000;

/**
 * 这次录制要找的那一次写：HTTP 方法 + URL 里必须含的一段（不填就是只认方法）。
 */
export interface RecordExpect {
  readonly method: string;
  readonly urlContains: string;
}

/**
 * 一次「截图」在宿主台账里的那一行：页面上的计数、落图那一刻、落盘路径；没落下来时带 `error` 原文（落成的那条没有它）。
 */
export interface RecordShot {
  readonly n: number;
  readonly at: number;
  readonly path: string;
  readonly error?: string;
}

/**
 * 某个页面计数已经试过几次：初拍算一次，失败再试一次；计数一换就从头数。
 */
export interface RecordShotTries {
  readonly n: number;
  readonly tries: number;
}

/**
 * 一张图最多试几次（初拍 + 一次重试）：失败如实报过就停，不每拍重试到底。
 */
export const RECORD_SHOT_TRIES = 2;

/**
 * 一份活着的录制约定：相位 + 谁的会话 + 哪个工作区 / 单元 + 页面 URL 与标题 + 要找的那一次写 +
 * 落盘文件 + 三个时间戳，以及两份台账：按计数落图的 `shots`（`shotsSeen` 只记落成的那个计数）
 * 与门铃的 `beats` / `beatMs`（命中几次、最近一次等了多久）。
 */
export interface RecordState {
  readonly phase: RecordPhase;
  readonly sessionId: string;
  readonly workspace: string;
  readonly unit: string;
  readonly name: string;
  readonly url: string;
  readonly title: string;
  readonly action: string;
  readonly expect: RecordExpect | null;
  readonly captureFile: string;
  readonly startedAt: number;
  readonly t0: number | null;
  readonly t1: number | null;
  readonly shots: readonly RecordShot[];
  readonly shotsSeen: number;
  readonly shotTries: RecordShotTries | null;
  readonly beats: number;
  readonly beatMs: number;
  readonly at: number;
}

/**
 * 开一次录制要交的那几件：会话、工作区、单元、名字、页面 URL 与标题、动作名、期望、落盘文件，以及此刻时间。
 */
export interface RecordPact {
  readonly sessionId: string;
  readonly workspace: string;
  readonly unit: string;
  readonly name: string;
  readonly url: string;
  readonly title: string;
  readonly action: string;
  readonly expect: RecordExpect | null;
  readonly captureFile: string;
  readonly now: number;
}

/**
 * 录制被拒的原因码：自己已持有 / 别人持着 / 不是持有者 / 没有约定 / 已在录 / 还没 arm / 不在录 / 还没录完。
 */
export type RecordRefusal =
  | 'already-held'
  | 'held-by-other'
  | 'not-owner'
  | 'none'
  | 'already-recording'
  | 'not-armed'
  | 'not-recording'
  | 'not-finished';

/**
 * 一次录制动作的结果：成功带新状态，失败带拒绝码。
 */
export type RecordMove =
  | { readonly ok: true; readonly state: RecordState }
  | { readonly ok: false; readonly code: RecordRefusal };

/**
 * 录制约定收得下的三个人话动作：看看进度 / 停手 / 结束并取回。
 */
export type RecordIntent = 'peek' | 'halt' | 'stop';

/**
 * 把工具入参收成人话动作。
 * @param raw - 任意入参值。
 * @returns `'peek'` / `'halt'` / `'stop'` 原样；别的值（含 `undefined`、多余空白）给 `null`，由调用方拒。
 */
export function parseRecordIntent(raw: unknown): RecordIntent | null {
  return raw === 'peek' || raw === 'halt' || raw === 'stop' ? raw : null;
}

/**
 * 录制约定的存取口（外壳持有一份）：相位随 `begin → started → finished` 推进，`release` 是收尾时放掉浏览器那一跳。
 */
export interface RecordStore {
  readonly release?: ((state: RecordState) => Promise<{ readonly tab: boolean; readonly capture: boolean }>) | undefined;
  live(now: number): RecordState | null;
  begin(pact: RecordPact): RecordMove;
  started(sessionId: string, at: number, now: number): RecordMove;
  finished(sessionId: string, at: number, now: number): RecordMove;
  shotTaken(sessionId: string, shot: RecordShot, now: number): RecordMove;
  shotFailed(sessionId: string, shot: RecordShot, now: number): RecordMove;
  beat(sessionId: string, ms: number, now: number): RecordMove;
  stop(sessionId: string, now: number): RecordMove;
}

/**
 * 这一拍该不该落图：页面计数涨过 `shotsSeen` 才算；同一个计数已经试满就先放下，等他自己再按。
 * @param state - 当前有效的那份约定。
 * @param pageShots - 页面浮条上那个「已拍」计数。
 * @returns 该落的那个计数；不该落给 `null`（没涨 / 试满了 / 不是个正经数）。
 */
export function shotDueOf(state: RecordState, pageShots: number): number | null {
  if (!Number.isFinite(pageShots)) return null;
  const n = Math.floor(pageShots);
  if (n <= state.shotsSeen) return null;
  if (state.shotTries !== null && state.shotTries.n === n && state.shotTries.tries >= RECORD_SHOT_TRIES) return null;
  return n;
}

function alive(state: RecordState | null, now: number): RecordState | null {
  if (state === null) return null;
  return now - state.at <= RECORD_STALE_MS ? state : null;
}

function ownerOf(state: RecordState | null, sessionId: string, now: number): RecordRefusal | RecordState {
  const held = alive(state, now);
  if (held === null) return 'none';
  return held.sessionId === sessionId ? held : 'not-owner';
}

/**
 * 造一份新的录制约定存储（进程内存，同一时刻只可能有一份有效约定）。
 * @returns 存取口；动作成不成都在返回的 `RecordMove` 里，不抛异常。
 */
export function createRecordStore(): RecordStore {
  let held: RecordState | null = null;

  const live = (now: number): RecordState | null => alive(held, now);

  const withShot = (found: RecordState, shot: RecordShot, now: number, error: string | undefined): RecordState => {
    const row: RecordShot = error === undefined ? shot : { n: shot.n, at: shot.at, path: shot.path, error };
    const kept = found.shots.filter((one) => one.n !== shot.n);
    const tries = found.shotTries !== null && found.shotTries.n === shot.n ? found.shotTries.tries : 0;
    return {
      ...found,
      shots: [...kept, row].sort((one, two) => one.n - two.n),
      shotsSeen: error === undefined ? Math.max(found.shotsSeen, shot.n) : found.shotsSeen,
      shotTries: error === undefined ? null : { n: shot.n, tries: tries + 1 },
      at: now,
    };
  };

  return {
    live,

    begin(pact) {
      const current = alive(held, pact.now);
      if (current !== null) {
        return { ok: false, code: current.sessionId === pact.sessionId ? 'already-held' : 'held-by-other' };
      }
      const state: RecordState = {
        phase: 'armed',
        sessionId: pact.sessionId,
        workspace: pact.workspace,
        unit: pact.unit,
        name: pact.name,
        url: pact.url,
        title: pact.title,
        action: pact.action,
        expect: pact.expect,
        captureFile: pact.captureFile,
        startedAt: pact.now,
        t0: null,
        t1: null,
        shots: [],
        shotsSeen: 0,
        shotTries: null,
        beats: 0,
        beatMs: 0,
        at: pact.now,
      };
      held = state;
      return { ok: true, state };
    },

    started(sessionId, at, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      if (found.phase === 'recording') return { ok: false, code: 'already-recording' };
      if (found.phase !== 'armed') return { ok: false, code: 'not-armed' };
      const state: RecordState = { ...found, phase: 'recording', t0: at, at: now };
      held = state;
      return { ok: true, state };
    },

    finished(sessionId, at, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      if (found.phase !== 'recording') return { ok: false, code: 'not-recording' };
      const state: RecordState = { ...found, phase: 'finished', t1: at, at: now };
      held = state;
      return { ok: true, state };
    },

    shotTaken(sessionId, shot, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      const state = withShot(found, shot, now, undefined);
      held = state;
      return { ok: true, state };
    },

    shotFailed(sessionId, shot, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      const state = withShot(found, shot, now, shot.error === undefined ? '落图失败' : shot.error);
      held = state;
      return { ok: true, state };
    },

    beat(sessionId, ms, now) {
      const found = ownerOf(held, sessionId, now);
      if (typeof found === 'string') return { ok: false, code: found };
      const state: RecordState = {
        ...found,
        beats: found.beats + 1,
        beatMs: Math.max(0, Math.floor(ms)),
        at: now,
      };
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
 * 「谁还占着、在录哪个动作」的一句话，用于别人来抢时说清现况。
 * @param state - 当前有效的那份约定。
 * @returns 形如「会话 x（自 HH:mm:ssZ 起在录 y 的「动作」）」的中文串。
 */
export function recordOwnerText(state: RecordState): string {
  const at = clockOf(state.startedAt);
  return `会话 ${state.sessionId}（自 ${at}Z 起在录 ${state.unit} 的「${state.action}」）`;
}
