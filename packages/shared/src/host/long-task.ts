import { epochOf, now as clockNow, nowIso } from './time.js';
import {
  runsRouteOf,
  type LongTaskIntervention,
  type LongTaskStatus,
  type LongTaskStep,
} from '../contract/long-task.js';

function isLiveStatus(status: LongTaskStatus): boolean {
  return status === 'running' || status === 'needs-human' || status === 'needs-login';
}

const RECENT_MS = 10 * 60 * 1000;

export interface LongTaskBase {
  readonly id: string;
  readonly workspace: string;
  readonly target: string;
  readonly headline?: string | undefined;
  readonly status: LongTaskStatus;
  readonly step: string;
  readonly steps: readonly string[];
  readonly intervention?: LongTaskIntervention | undefined;
  readonly loginUrl?: string | undefined;
  readonly why?: string | undefined;
  readonly startedAt: string;
  readonly at: string;
  readonly session?: string | undefined;
}

export interface LongTaskStart {
  readonly workspace: string;
  readonly target: string;
  readonly payload?: unknown;
  readonly session?: string | undefined;
}

export interface LongTaskChange<S extends LongTaskBase> {
  readonly kind: 'start' | 'step' | 'settle';
  readonly snapshot: S;
  readonly step?: LongTaskStep | undefined;
  readonly by?: string | undefined;
}

export interface LongTaskDeps<S extends LongTaskBase> {
  readonly run: (options: {
    readonly payload: unknown;
    readonly onStep: (step: LongTaskStep) => void;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  readonly step?: ((step: LongTaskStep, current: S) => Partial<S>) | undefined;
  readonly outcome?: ((result: unknown, current: S) => Partial<S>) | undefined;
  readonly stopped?: ((current: S) => Partial<S>) | undefined;
  readonly recheck?: ((current: S) => void) | undefined;
  readonly answer?: ((current: S, values: Readonly<Record<string, string>>) => void) | undefined;
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
  readonly resumable: boolean;
  readonly answerable: boolean;
  start(options: LongTaskStart): S;
  snapshot(id: string): S | null;
  active(workspace: string, target: string): S | null;
  current(workspace: string): readonly Readonly<Record<string, unknown>>[];
  live(): readonly S[];
  stop(id: string, by?: string): boolean;
  recheck(id: string): boolean;
  answer(id: string, values: Readonly<Record<string, string>>): boolean;
  onChange(listener: (change: LongTaskChange<S>) => void): () => void;
  rebind?(deps: LongTaskDeps<S>): void;
}

export function createLongTaskRegistry<S extends LongTaskBase>(deps: LongTaskDeps<S>): LongTaskRegistry<S> {
  let bound = deps;

  const runs = new Map<string, LongTaskBase>();
  const controls = new Map<string, AbortController>();
  const now = bound.now ?? (() => nowIso());
  let counter = 0;
  const nextId = bound.nextId ?? (() => `run-${clockNow()}-${(counter += 1)}`);
  const recentMs = bound.recentMs ?? RECENT_MS;
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
      const floor = epochOf(now()) - recentMs;
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
          ...bound.view(snapshot as S),
          id: snapshot.id,
          ...(bound.recheck === undefined ? {} : { resumable: true }),
          ...(bound.answer === undefined ? {} : { answerable: true }),
        }));
    },

    live() {
      return [...runs.values()].filter((snapshot) => isLiveStatus(snapshot.status)) as S[];
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
        startedAt,
        at: startedAt,
        ...(options.session === undefined ? {} : { session: options.session }),
      });
      notify({ kind: 'start', snapshot: runs.get(id) as S });

      const onStep = (step: LongTaskStep): void => {
        const current = live(id);
        if (current === null) return;
        const steps = [...current.steps, `${step.kind === 'fail' ? '✗ ' : ''}${step.text}`].slice(-20);
        const extra = bound.step?.(step, current) ?? {};
        if (step.intervention !== undefined) {
          patch(
            id,
            {
              ...extra,
              status: 'needs-human',
              step: step.text,
              steps,
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
            { ...extra, status: 'needs-login', step: step.text, steps, loginUrl: step.loginUrl },
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

export interface LongTaskHost {
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
