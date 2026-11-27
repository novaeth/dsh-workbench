import { epochOf, now as clockNow, nowIso } from '../runtime/time.js';
import {
  LONG_TASK_HISTORY_MAX,
  LONG_TASK_LINK_MAX,
  runsRouteOf,
  type LongTaskIntervention,
  type LongTaskLink,
  type LongTaskStatus,
  type LongTaskStep,
  type LongTaskStepRow,
} from '../../contract/long-task.js';

function isLiveStatus(status: LongTaskStatus): boolean {
  return status === 'running' || status === 'needs-human' || status === 'needs-login';
}

const RECENT_MS = 10 * 60 * 1000;

function mergeStepRow(
  rows: readonly LongTaskStepRow[],
  row: LongTaskStepRow,
): LongTaskStepRow[] {
  if (row.stepId === undefined) return [...rows, row].slice(-LONG_TASK_HISTORY_MAX);
  const at = rows.findIndex((one) => one.stepId === row.stepId);
  if (at === -1) return [...rows, row].slice(-LONG_TASK_HISTORY_MAX);
  const next = [...rows];
  next[at] = row;
  return next;
}

export interface LongTaskBase {
  readonly id: string;
  readonly workspace: string;
  readonly target: string;
  readonly headline?: string | undefined;
  readonly status: LongTaskStatus;
  readonly step: string;
  readonly steps: readonly string[];
  readonly history?: readonly LongTaskStepRow[] | undefined;
  readonly links?: readonly LongTaskLink[] | undefined;
  readonly intervention?: LongTaskIntervention | undefined;
  readonly loginUrl?: string | undefined;
  readonly why?: string | undefined;
  readonly startedAt: string;
  readonly at: string;
  readonly session?: string | undefined;
  readonly seen?: boolean | undefined;
}

export interface LongTaskStart {
  readonly workspace: string;
  readonly target: string;
  readonly payload?: unknown;
  readonly session?: string | undefined;
}

export interface LongTaskChange<S extends LongTaskBase> {
  readonly kind: 'start' | 'step' | 'settle' | 'seen';
  readonly snapshot: S;
  readonly step?: LongTaskStep | undefined;
  readonly by?: string | undefined;
}

/** 长任务怎么跑、怎么投影成面板那一行。 */
export interface LongTaskDeps<S extends LongTaskBase> {
  /** 真正执行任务：payload 来自 start，onStep 报步骤，signal 被 abort 时尽快退出。 */
  readonly run: (options: {
    readonly payload: unknown;
    readonly onStep: (step: LongTaskStep) => void;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  readonly step?: ((step: LongTaskStep, current: S) => Partial<S>) | undefined;
  readonly outcome?: ((result: unknown, current: S) => Partial<S>) | undefined;
  readonly stopped?: ((current: S) => Partial<S>) | undefined;
  /** 用户点「我处理完了」时调；不给行上就没这颗钮。 */
  readonly recheck?: ((current: S) => void) | undefined;
  /** 用户交回执时调；不给行上就没表单。 */
  readonly answer?: ((current: S, values: Readonly<Record<string, string>>) => void) | undefined;
  /** 把快照投影成面板那一行要的字段。 */
  readonly view: (snapshot: S) => Readonly<Record<string, unknown>>;
  readonly now?: (() => string) | undefined;
  readonly nextId?: (() => string) | undefined;
  readonly facts?: ((change: LongTaskChange<S>) => readonly string[] | undefined) | undefined;
  readonly recentMs?: number | undefined;
}

/**
 * 一个单元的长任务注册表：`current(workspace)` 是面板那一行要的投影，`live()` 是外壳侧栏那颗
 * loading 点要的（**不分工作区、不分目标**，把现在活着的每一趟交出来），`stop` 只把中断信号转给生产方。
 */
export interface LongTaskRegistry<S extends LongTaskBase> {
  /** 行上有没有「我处理完了」；建注册表时给了 recheck 才 true。 */
  readonly resumable: boolean;
  /** 行上有没有结构化回执表单；建注册表时给了 answer 才 true。 */
  readonly answerable: boolean;
  /** 起一趟；同 workspace + target 已有活的就直接返回它，不重复起。 */
  start(options: LongTaskStart): S;
  /** 按 id 取快照；不在或已清掉回 null。 */
  snapshot(id: string): S | null;
  /** 找同 workspace + target 的活任务；没有回 null。 */
  active(workspace: string, target: string): S | null;
  /** 一个工作区里每个 target 最新一趟的投影；活的加最近 recentMs 内的。 */
  current(workspace: string): readonly Readonly<Record<string, unknown>>[];
  /** 现在活着的每一趟，不分工作区 / 目标；给侧栏状态点用。 */
  live(): readonly S[];
  /** 现在活着的，加上最近 `recentMs` 内刚收尾的每一趟；给左栏那张全局长任务列表用。 */
  recent(): readonly S[];
  /** 请求停止：把中断信号转给生产方；没有这趟或已经结束回 false。 */
  stop(id: string, by?: string): boolean;
  /** 把已收尾的一趟标成「看过」；活着 / 不认识回 false。不刷新 `at`。 */
  seen(id: string): boolean;
  recheck(id: string): boolean;
  /** 交回执：只认 intervention.fields 里的 key，必填缺失回 false。 */
  answer(id: string, values: Readonly<Record<string, string>>): boolean;
  onChange(listener: (change: LongTaskChange<S>) => void): () => void;
  rebind?(deps: LongTaskDeps<S>): void;
}

/**
 * 长任务行里那一层通用字段：去掉身份（`id` / `workspace`）之后的全套快照。
 */
export type LongTaskRowBase = Omit<LongTaskBase, 'id' | 'workspace'>;

function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/**
 * 长任务快照的通用字段：外壳先铺这一层，模块的 `view()` 只覆盖、不遗漏。
 * @param snapshot 这一趟的快照。
 * @returns `target` / `status` / `step` / `steps` / `startedAt` / `at` 与快照里存在的可选字段。
 */
export function longTaskRowBase(snapshot: LongTaskBase): LongTaskRowBase {
  return {
    target: snapshot.target,
    status: snapshot.status,
    step: snapshot.step,
    steps: snapshot.steps,
    startedAt: snapshot.startedAt,
    at: snapshot.at,
    ...pickDefined(snapshot, [
      'headline',
      'history',
      'links',
      'intervention',
      'loginUrl',
      'why',
      'session',
      'seen',
    ]),
  };
}

export function createLongTaskRegistry<S extends LongTaskBase>(deps: LongTaskDeps<S>): LongTaskRegistry<S> {
  let bound = deps;

  const runs = new Map<string, LongTaskBase>();
  const controls = new Map<string, AbortController>();
  const now = (): string => (bound.now ?? nowIso)();
  let counter = 0;
  const nextId = (): string => (bound.nextId ?? (() => `run-${clockNow()}-${(counter += 1)}`))();
  const recentMs = (): number => bound.recentMs ?? RECENT_MS;
  const listeners = new Set<(change: LongTaskChange<S>) => void>();

  const live = (id: string): S | null => {
    const current = runs.get(id);
    if (current === undefined || !isLiveStatus(current.status)) return null;
    return current as S;
  };

  const notify = (change: LongTaskChange<S>): void => {
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch {
      }
    }
  };

  const patch = (id: string, next: Partial<LongTaskBase>, change: Omit<LongTaskChange<S>, 'snapshot'>): void => {
    const current = runs.get(id);
    if (current === undefined) return;
    const patched = { ...current, ...next, at: now() };
    runs.set(id, patched);
    notify({ ...change, snapshot: patched as S });
  };

  return {
    get resumable() {
      return bound.recheck !== undefined;
    },

    get answerable() {
      return bound.answer !== undefined;
    },

    active(workspace, target) {
      for (const snapshot of runs.values()) {
        if (snapshot.workspace !== workspace || snapshot.target !== target) continue;
        if (isLiveStatus(snapshot.status)) return snapshot as S;
      }
      return null;
    },

    current(workspace) {
      const floor = epochOf(now()) - recentMs();
      const newest = new Map<string, LongTaskBase>();
      for (const snapshot of runs.values()) {
        if (snapshot.workspace !== workspace) continue;
        newest.set(snapshot.target, snapshot);
      }
      return [...newest.values()]
        .filter(
          (snapshot) => isLiveStatus(snapshot.status) || epochOf(snapshot.at) >= floor,
        )
        .reverse()
        .map((snapshot) => ({
          ...longTaskRowBase(snapshot),
          ...bound.view(snapshot as S),
          id: snapshot.id,
          ...(bound.recheck === undefined ? {} : { resumable: true }),
          ...(bound.answer === undefined ? {} : { answerable: true }),
        }));
    },

    live() {
      return [...runs.values()].filter((snapshot) => isLiveStatus(snapshot.status)) as S[];
    },

    recent() {
      const floor = epochOf(now()) - recentMs();
      return [...runs.values()].filter(
        (snapshot) => isLiveStatus(snapshot.status) || epochOf(snapshot.at) >= floor,
      ) as S[];
    },

    start(options) {
      const running = this.active(options.workspace, options.target);
      if (running !== null) return running;
      const id = nextId();
      const startedAt = now();
      runs.set(id, {
        id,
        workspace: options.workspace,
        target: options.target,
        status: 'running',
        step: '',
        steps: [],
        history: [],
        startedAt,
        at: startedAt,
        seen: false,
        ...(options.session === undefined ? {} : { session: options.session }),
      });
      notify({ kind: 'start', snapshot: runs.get(id) as S });

      const onStep = (step: LongTaskStep): void => {
        const current = live(id);
        if (current === null) return;
        const repeated =
          current.step === step.text &&
          step.intervention !== undefined &&
          current.intervention?.title === step.intervention.title;
        const historyRow: LongTaskStepRow = {
          kind: step.kind,
          text: step.text,
          ...pickDefined(
            {
              stepId: step.stepId,
              attempt: step.attempt,
              links: step.links?.slice(0, LONG_TASK_LINK_MAX),
            },
            ['stepId', 'attempt', 'links'],
          ),
        };
        const history = repeated
          ? current.history ?? []
          : mergeStepRow(current.history ?? [], historyRow);
        const steps = history.map(
          (row) => `${row.kind === 'fail' ? '✗ ' : ''}${row.text}`,
        );
        const extra = bound.step?.(step, current) ?? {};
        if (step.intervention !== undefined) {
          patch(
            id,
            {
              ...extra,
              status: 'needs-human',
              step: step.text,
              steps,
              history,
              intervention: step.intervention,
              loginUrl: undefined,
            },
            { kind: 'step', step },
          );
          return;
        }
        if (step.loginUrl !== undefined && step.loginUrl !== '') {
          patch(
            id,
            {
              ...extra,
              status: 'needs-login',
              step: step.text,
              steps,
              history,
              loginUrl: step.loginUrl,
            },
            { kind: 'step', step },
          );
          return;
        }
        patch(
          id,
          {
            ...extra,
            status: 'running',
            step: step.text,
            steps,
            history,
            intervention: undefined,
            loginUrl: undefined,
          },
          { kind: 'step', step },
        );
      };

      const control = new AbortController();
      controls.set(id, control);

      void bound
        .run({ payload: options.payload, onStep, signal: control.signal })
        .then((result) => {
          const current = live(id);
          if (current === null) return;
          controls.delete(id);
          patch(
            id,
            {
              status: 'ok',
              ...(bound.outcome?.(result, current) ?? {}),
              intervention: undefined,
              loginUrl: undefined,
            },
            { kind: 'settle' },
          );
        })
        .catch((error: unknown) => {
          if (live(id) === null) return;
          controls.delete(id);
          patch(
            id,
            {
              status: 'failed',
              why: error instanceof Error ? error.message : String(error),
              intervention: undefined,
              loginUrl: undefined,
            },
            { kind: 'settle' },
          );
        });

      return runs.get(id) as S;
    },

    recheck(id) {
      const current = live(id);
      if (current === null || bound.recheck === undefined) return false;
      bound.recheck(current as S);
      return true;
    },

    answer(id, values) {
      const current = live(id);
      if (current === null || bound.answer === undefined) return false;
      const fields = current.intervention?.fields;
      if (fields === undefined || fields.length === 0) return false;
      const clean: Record<string, string> = {};
      for (const field of fields) {
        const raw = values[field.key];
        const text = typeof raw === 'string' ? raw.trim() : '';
        if (text === '') {
          if (field.required === true) return false;
          continue;
        }
        clean[field.key] = text;
      }
      bound.answer(current as S, clean);
      return true;
    },

    stop(id, by) {
      const current = live(id);
      if (current === null) return false;
      controls.get(id)?.abort();
      controls.delete(id);
      patch(
        id,
        {
          ...(bound.stopped?.(current) ?? {}),
          status: 'stopped',
          intervention: undefined,
          loginUrl: undefined,
        },
        { kind: 'settle', by },
      );
      return true;
    },

    seen(id) {
      const current = runs.get(id);
      if (current === undefined || isLiveStatus(current.status)) return false;
      if (current.seen === true) return true;
      const patched = { ...current, seen: true };
      runs.set(id, patched);
      notify({ kind: 'seen', snapshot: patched as S });
      return true;
    },

    snapshot(id) {
      return (runs.get(id) as S | undefined) ?? null;
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    rebind(next) {
      bound = next;
    },
  };
}

/**
 * `withInterventionRetry` 的口径：最多试几次、每轮先等多久（也可按轮次算）、怎么等。
 */
export interface InterventionRetryOptions {
  readonly attempts?: number | undefined;
  readonly delayMs?: number | ((attempt: number) => number) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

const INTERVENTION_RETRY_ATTEMPTS = 5;

const INTERVENTION_RETRY_DELAY_MS = 1500;

function defaultInterventionSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * 把「看一眼接上没有」包成能交给 `longTasks.create({ recheck })` 的 handler：
 * 用户在人工干预节点上按「我处理完了」时先立刻试一次，没接上就有界地再试（第 2 轮起每轮先等）。
 * `check` 返回 true = 已经接上，不用再试；抛错算没接上、继续下一轮。
 * 同一 id 上一轮还在飞时再按直接忽略；成功 / 用尽都清单飞；**永不抛错**（fire-and-forget）。
 * @param check 看一眼接上没有，可同步可异步。
 * @param options 轮次上限（默认 5）、第几次等待等多久（默认 1500ms，可给函数，从第 1 次等待起算）、怎么等（默认真等，测试可注入假的）。
 * @returns 一条同签名的 handler，直接交给 `const longTasks = create({ recheck })`。
 */
export function withInterventionRetry<S extends LongTaskBase>(
  check: (current: S) => boolean | Promise<boolean>,
  options: InterventionRetryOptions = {},
): (current: S) => void {
  const attempts = options.attempts ?? INTERVENTION_RETRY_ATTEMPTS;
  const delayMs = options.delayMs ?? INTERVENTION_RETRY_DELAY_MS;
  const sleep = options.sleep ?? defaultInterventionSleep;
  const inFlight = new Set<string>();
  return (current: S): void => {
    if (inFlight.has(current.id)) return;
    inFlight.add(current.id);
    void (async () => {
      try {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          if (attempt > 1) {
            await sleep(typeof delayMs === 'function' ? delayMs(attempt - 1) : delayMs);
          }
          try {
            if (await check(current)) return;
          } catch {
          }
        }
      } catch {
      } finally {
        inFlight.delete(current.id);
      }
    })();
  };
}

function isRegistry(value: unknown): value is LongTaskRegistry<LongTaskBase> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LongTaskRegistry<LongTaskBase>>;
  return (
    typeof candidate.start === 'function' &&
    typeof candidate.current === 'function' &&
    typeof candidate.snapshot === 'function' &&
    typeof candidate.onChange === 'function'
  );
}

export function sharedLongTaskRegistry<S extends LongTaskBase>(
  scope: string,
  key: string,
  deps: LongTaskDeps<S>,
): LongTaskRegistry<S> {
  const store = globalThis as unknown as Record<symbol, LongTaskRegistry<LongTaskBase> | undefined>;
  const slot = Symbol.for(`dsh-workbench:long-task:${scope}:${key}`);
  const existing = store[slot];
  if (existing !== undefined && isRegistry(existing)) {
    existing.rebind?.(deps as LongTaskDeps<LongTaskBase>);
    return existing as unknown as LongTaskRegistry<S>;
  }
  const created = createLongTaskRegistry(deps);
  store[slot] = created as unknown as LongTaskRegistry<LongTaskBase>;
  return created;
}

/** 一个单元的长任务入口：按 key 建注册表。 */
export interface LongTaskHost {
  /** key 是模块内稳定的标识；run / view 必给，recheck / answer 决定行上有没有恢复与回执。 */
  create<S extends LongTaskBase>(options: { readonly key: string } & LongTaskDeps<S>): LongTaskRegistry<S>;
}

export function createLongTaskHost(options: {
  readonly scope: string;
  readonly unit: string;
  readonly bump: (facts: readonly string[]) => void;
  readonly notify?: ((change: LongTaskChange<LongTaskBase>) => void) | undefined;
}): { readonly host: LongTaskHost; dispose(): void } {
  const offs: Array<() => void> = [];
  return {
    host: {
      create(createOptions) {
        const { key, facts, ...deps } = createOptions;
        const registry = sharedLongTaskRegistry(options.scope, `${options.unit}:${key}`, deps);
        offs.push(
          registry.onChange((change) => {
            const named = [runsRouteOf(options.unit), ...(facts?.(change) ?? [])];
            options.bump([...new Set(named)]);
            options.notify?.(change);
          }),
        );
        return registry;
      },
    },
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}
