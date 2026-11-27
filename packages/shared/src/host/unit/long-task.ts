import { epochOf, now as clockNow, nowIso } from '../runtime/time.js';
import { derivedLongTaskProgress, nextLongTaskProgress } from './long-task-progress.js';
import {
  LONG_TASK_HISTORY_MAX,
  LONG_TASK_LINK_MAX,
  longTaskPlanTotalOf,
  longTaskPlanStepsOf,
  type LongTaskIntervention,
  type LongTaskLink,
  type LongTaskPlan,
  type LongTaskPlanStep,
  type LongTaskProgress,
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
  readonly progress?: LongTaskProgress | undefined;
  readonly plan?: readonly LongTaskPlanStep[] | undefined;
}

export interface LongTaskStart {
  readonly workspace: string;
  readonly target: string;
  readonly payload?: unknown;
  readonly session?: string | undefined;
}

export interface LongTaskChange<S extends LongTaskBase> {
  readonly kind: 'start' | 'step' | 'progress' | 'settle' | 'seen';
  readonly snapshot: S;
  readonly step?: LongTaskStep | undefined;
  readonly by?: string | undefined;
}

/** 长任务怎么跑、怎么投影成面板那一行。 */
export interface LongTaskDeps<S extends LongTaskBase> {
  /** 这一趟打算走几步；给了就有进度条（外壳从步骤事件自己数），没给就不画。 */
  readonly plan?: LongTaskPlan | undefined;
  /** 真正执行任务：payload 来自 start，onStep 报步骤，onProgress 报走到哪了，signal 被 abort 时尽快退出。 */
  readonly run: (options: {
    readonly payload: unknown;
    readonly onStep: (step: LongTaskStep) => void;
    readonly onProgress: (progress: LongTaskProgress) => void;
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
      'progress',
      'plan',
    ]),
  };
}

export function createLongTaskRegistry<S extends LongTaskBase>(deps: LongTaskDeps<S>): LongTaskRegistry<S> {
  let bound = deps;

  const runs = new Map<string, LongTaskBase>();
  const controls = new Map<string, AbortController>();
  const reported = new Set<string>();
  const counted = new Set<string>();
  const warned = new Set<string>();
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
    const resolved =
      next.progress === undefined
        ? current.progress
        : (nextLongTaskProgress(next.progress, current.progress) ?? undefined);
    const patched: { -readonly [K in keyof LongTaskBase]: LongTaskBase[K] } = {
      ...current,
      ...next,
      at: now(),
    };
    if (resolved === undefined) delete patched.progress;
    else patched.progress = resolved;
    runs.set(id, patched);
    notify({ ...change, snapshot: patched as S });
  };

  const setProgress = (id: string, next: LongTaskProgress | undefined): void => {
    const current = runs.get(id);
    if (current === undefined) return;
    const resolved = next === undefined ? null : nextLongTaskProgress(next, current.progress);
    if (resolved === null) {
      if (current.progress === undefined) return;
      const cleared: { -readonly [K in keyof LongTaskBase]: LongTaskBase[K] } = { ...current };
      delete cleared.progress;
      runs.set(id, cleared);
      notify({ kind: 'progress', snapshot: cleared as S });
      return;
    }
    if (current.progress?.done === resolved.done && current.progress.total === resolved.total) return;
    const patched = { ...current, progress: resolved };
    runs.set(id, patched);
    notify({ kind: 'progress', snapshot: patched as S });
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
      const planTotal = bound.plan === undefined ? 0 : longTaskPlanTotalOf(bound.plan);
      const planSteps = bound.plan === undefined ? [] : longTaskPlanStepsOf(bound.plan);
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
        ...(planTotal > 0 ? { progress: { done: 0, total: planTotal } } : {}),
        ...(planSteps.length === 0 ? {} : { plan: planSteps }),
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
        const extra: Partial<S> = bound.step?.(step, current) ?? {};
        if (extra.progress !== undefined) reported.add(id);
        const derived = reported.has(id)
          ? undefined
          : derivedLongTaskProgress(history, planTotal, planSteps);
        if (derived !== undefined) counted.add(id);
        if (planTotal === 0 && !reported.has(id) && !warned.has(id)) {
          const ids = new Set(history.map((row) => row.stepId));
          if (ids.size >= 3) {
            warned.add(id);
            console.warn(
              `[dsh-workbench] 长任务（${current.target}）已经报了 ${String(ids.size)} 个步骤却没有计划 —— ` +
                '行上没有进度条：在 longTasks.create 里给一次 plan（{ steps } 或 { total }），步数由外壳自己数',
            );
          }
        }
        const next = derived === undefined ? extra : { ...extra, progress: derived };
        if (step.intervention !== undefined) {
          patch(
            id,
            {
              ...next,
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
              ...next,
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
            ...next,
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

      const onProgress = (next: LongTaskProgress): void => {
        if (live(id) === null) return;
        reported.add(id);
        counted.add(id);
        setProgress(id, next);
      };

      void bound
        .run({ payload: options.payload, onStep, onProgress, signal: control.signal })
        .then((result) => {
          const current = live(id);
          if (current === null) return;
          controls.delete(id);
          const outcome: Partial<S> = bound.outcome?.(result, current) ?? {};
          const filled =
            outcome.progress ??
            (current.progress === undefined
              ? undefined
              : { done: current.progress.total, total: current.progress.total });
          patch(
            id,
            {
              ...outcome,
              status: 'ok',
              ...(filled === undefined ? {} : { progress: filled }),
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
export { withInterventionRetry, type InterventionRetryOptions } from './with-intervention-retry.js';


