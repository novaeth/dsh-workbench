/**
 * 一张面板卡片取数走到哪一步：`idle` 还没取、`loading` 取着、`ready` 拿到了、`error` 失败了。
 */
export type PanelCardPhase = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 一次取数失败：机器码 + 给人看的一句话。
 */
export interface PanelCardError {
  readonly code: string;
  readonly message: string;
}

/**
 * 一张卡片最近一次取数的读数：哪个单元、哪条路由、什么相位、什么时候、失败原因。
 */
export interface PanelCardRead {
  readonly unit: string;
  readonly route: string;
  readonly phase: PanelCardPhase;
  readonly at: number;
  readonly error?: PanelCardError;
}

/**
 * 一张卡片崩了的读数：单元、原因、时间，以及同一原因连着崩了几次（窗口见 `PANEL_STATE_CRASH_WINDOW_MS`）。
 */
export interface PanelCardCrash {
  readonly unit: string;
  readonly reason: string;
  readonly at: number;
  readonly count: number;
}

/**
 * 一个单元此刻的读数：它的卡片、最近一次读成的时间（`okAt`，没成过给 `null`），以及崩了的那一条。
 */
export interface PanelUnitReport {
  readonly unit: string;
  readonly at: number;
  readonly okAt: number | null;
  readonly cards: readonly PanelCardRead[];
  readonly crash?: PanelCardCrash;
}

/**
 * 一个工作区此刻的全量读数（面板按工作区存）：所有单元的读数 + 整块最近动过的时间。
 */
export interface PanelWorkspaceReport {
  readonly workspace: string | null;
  readonly at: number;
  readonly units: readonly PanelUnitReport[];
}

/**
 * 客户端往上报的一批卡片读数（`POST` 请求体的形状）。
 */
export interface PanelCardsReport {
  readonly workspace: string;
  readonly cards: readonly PanelCardRead[];
}

/**
 * 客户端往上报的一次卡片崩溃（`POST` 请求体的形状）。
 */
export interface PanelCrashReport {
  readonly workspace: string;
  readonly unit: string;
  readonly reason: string;
  readonly at: number;
}

/**
 * 面板运行态的留存口（宿主持有一份）：收卡片读数与崩溃，按工作区取快照。
 */
export interface PanelStateStore {
  cards(report: PanelCardsReport): void;
  crash(report: PanelCrashReport): void;
  snapshot(workspace: string | null): PanelWorkspaceReport;
}

/**
 * 留存的工作区上限（LRU，满 64 个丢最旧的）。
 */
export const PANEL_STATE_MAX_UNITS = 64;
/**
 * 每个单元留存的卡片上限（按路由 LRU，满 12 张丢最旧的）。
 */
export const PANEL_STATE_MAX_CARDS = 12;
/**
 * 一次上报最多读入的卡片条数（32 条之后的丢掉）。
 */
export const PANEL_STATE_MAX_REPORTS = 32;
/**
 * 同一原因的连续崩溃算进同一次计数的窗口（10 分钟，毫秒）。
 */
export const PANEL_STATE_CRASH_WINDOW_MS = 600000;
/**
 * 上报文本字段的截断长度（2000 字符；workspace / reason / message 共用）。
 */
export const PANEL_STATE_MAX_TEXT = 2000;

const PHASES: readonly PanelCardPhase[] = ['idle', 'loading', 'ready', 'error'];

interface UnitEntry {
  at: number;
  cards: Map<string, PanelCardRead>;
  crash?: PanelCardCrash;
}

interface WorkspaceEntry {
  at: number;
  units: Map<string, UnitEntry>;
}

/**
 * 上报解析的结果：`ok: true` 带收好的值，`ok: false` 带一句中文原因（直接回给上报方）。
 */
export type PanelParse<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function textOf(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function atOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.trunc(value);
}

function errorOf(raw: unknown): PanelCardError | undefined {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  const code = textOf(record['code'], 120);
  const message = textOf(record['message'], PANEL_STATE_MAX_TEXT);
  if (code === '' && message === '') return undefined;
  return { code: code === '' ? 'unknown' : code, message };
}

/**
 * 收一批卡片读数上报。
 * @param payload - `POST` 的请求体。
 * @returns 至少收到一条能认的卡片才 `ok: true`；请求体不是对象、`workspace` 为空、`cards` 不是数组，
 *   或一条都认不出（`unit` / `route` / `phase` / `at` 缺一）时 `ok: false` + 中文原因；认不出的单条静默跳过。
 */
export function parseCardsReport(payload: unknown): PanelParse<PanelCardsReport> {
  const record = asRecord(payload);
  if (record === undefined) return { ok: false, message: '请求体要是一个对象' };
  const workspace = textOf(record['workspace'], PANEL_STATE_MAX_TEXT);
  if (workspace === '') return { ok: false, message: 'workspace 不能是空的 —— 面板按工作区存' };
  const raw = record['cards'];
  if (!Array.isArray(raw)) return { ok: false, message: 'cards 要是一个数组' };
  const cards: PanelCardRead[] = [];
  for (const item of raw.slice(0, PANEL_STATE_MAX_REPORTS)) {
    const card = asRecord(item);
    if (card === undefined) continue;
    const unit = textOf(card['unit'], 200);
    const route = textOf(card['route'], 400);
    const phase = textOf(card['phase'], 20) as PanelCardPhase;
    const at = atOf(card['at']);
    if (unit === '' || route === '' || at === null || !PHASES.includes(phase)) continue;
    const error = errorOf(card['error']);
    cards.push({ unit, route, phase, at, ...(error === undefined ? {} : { error }) });
  }
  if (cards.length === 0) return { ok: false, message: 'cards 里没有一条能认的（unit / route / phase / at 都要有）' };
  return { ok: true, value: { workspace, cards } };
}

/**
 * 收一次卡片崩溃上报。
 * @param payload - `POST` 的请求体。
 * @returns `workspace` / `unit` / `reason` 都不能空，缺一给 `ok: false` + 中文原因；`at` 缺省或不合法时取当前时间。
 */
export function parseCrashReport(payload: unknown): PanelParse<PanelCrashReport> {
  const record = asRecord(payload);
  if (record === undefined) return { ok: false, message: '请求体要是一个对象' };
  const workspace = textOf(record['workspace'], PANEL_STATE_MAX_TEXT);
  const unit = textOf(record['unit'], 200);
  const reason = textOf(record['reason'], PANEL_STATE_MAX_TEXT);
  if (workspace === '') return { ok: false, message: 'workspace 不能是空的' };
  if (unit === '') return { ok: false, message: 'unit 不能是空的' };
  if (reason === '') return { ok: false, message: 'reason 不能是空的（没有原因的崩溃没法查）' };
  return { ok: true, value: { workspace, unit, reason, at: atOf(record['at']) ?? Date.now() } };
}

/**
 * 造一份面板运行态的留存（进程内存、按工作区分桶，带上面那几条上限的 LRU）。
 * @returns 留存口：`cards` / `crash` 收上报，`snapshot(workspace)` 取全量；没存过的工作区（含 `null`）给一份空的。
 */
export function createPanelStateStore(): PanelStateStore {
  const workspaces = new Map<string, WorkspaceEntry>();

  function trim(entry: Map<string, unknown>, max: number): void {
    while (entry.size > max) {
      const oldest = entry.keys().next();
      if (oldest.done === true) return;
      entry.delete(oldest.value);
    }
  }

  function workspaceEntryOf(workspace: string): WorkspaceEntry {
    const existing = workspaces.get(workspace);
    if (existing !== undefined) return existing;
    const created: WorkspaceEntry = { at: 0, units: new Map() };
    workspaces.set(workspace, created);
    trim(workspaces, PANEL_STATE_MAX_UNITS);
    return created;
  }

  function unitEntryOf(entry: WorkspaceEntry, unit: string): UnitEntry {
    const existing = entry.units.get(unit);
    if (existing !== undefined) return existing;
    const created: UnitEntry = { at: 0, cards: new Map() };
    entry.units.set(unit, created);
    return created;
  }

  return {
    cards(report) {
      const entry = workspaceEntryOf(report.workspace);
      for (const card of report.cards) {
        const unit = unitEntryOf(entry, card.unit);
        unit.cards.delete(card.route);
        unit.cards.set(card.route, card);
        trim(unit.cards, PANEL_STATE_MAX_CARDS);
        if (card.at > unit.at) unit.at = card.at;
        if (card.at > entry.at) entry.at = card.at;
      }
    },

    crash(report) {
      const entry = workspaceEntryOf(report.workspace);
      const unit = unitEntryOf(entry, report.unit);
      const previous = unit.crash;
      const counted =
        previous !== undefined &&
        previous.reason === report.reason &&
        report.at >= previous.at &&
        report.at - previous.at <= PANEL_STATE_CRASH_WINDOW_MS;
      unit.crash = { unit: report.unit, reason: report.reason, at: report.at, count: counted ? previous.count + 1 : 1 };
      if (report.at > unit.at) unit.at = report.at;
      if (report.at > entry.at) entry.at = report.at;
    },

    snapshot(workspace) {
      if (workspace === null) return { workspace: null, at: 0, units: [] };
      const entry = workspaces.get(workspace);
      if (entry === undefined) return { workspace, at: 0, units: [] };
      const units = [...entry.units.entries()].map(([unit, one]): PanelUnitReport => {
        const cards = [...one.cards.values()].sort((a, b) => a.route.localeCompare(b.route));
        const okAt = cards.reduce<number | null>(
          (best, card) => (card.phase === 'ready' && (best === null || card.at > best) ? card.at : best),
          null,
        );
        return { unit, at: one.at, okAt, cards, ...(one.crash === undefined ? {} : { crash: one.crash }) };
      });
      units.sort((a, b) => b.at - a.at || a.unit.localeCompare(b.unit));
      return { workspace, at: entry.at, units };
    },
  };
}
