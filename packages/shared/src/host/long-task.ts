import { epochOf } from './time.js';
import { runsRouteOf, type LongTaskStatus, type LongTaskStep } from '../api/long-task.js';

const LIVE: ReadonlySet<string> = new Set<LongTaskStatus>(['running', 'needs-login']);

const RECENT_MS = 10 * 60 * 1000;

export interface LongTaskBase {
  readonly id: string;
  readonly workspace: string;
  readonly target: string;
  readonly status: LongTaskStatus;
  readonly step: string;
  readonly steps: readonly string[];
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
  start(options: LongTaskStart): S;
  snapshot(id: string): S | null;
  active(workspace: string, target: string): S | null;
  current(workspace: string): readonly Readonly<Record<string, unknown>>[];
  live(): readonly S[];
  stop(id: string, by?: string): boolean;
  onChange(listener: (change: LongTaskChange<S>) => void): () => void;
}

export function createLongTaskRegistry<S extends LongTaskBase>(deps: LongTaskDeps<S>): LongTaskRegistry<S> {
  const runs = new Map<string, LongTaskBase>();
  const controls = new Map<string, AbortController>();
  const now = deps.now ?? (() => new Date().toISOString());
  let counter = 0;
  const nextId = deps.nextId ?? (() => `run-${Date.now()}-${(counter += 1)}`);
  const recentMs = deps.recentMs ?? RECENT_MS;
  const listeners = new Set<(change: LongTaskChange<S>) => void>();

  const live = (id: string): S | null => {
    const current = runs.get(id);
    if (current === undefined || !LIVE.has(current.status)) return null;
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
    active(workspace, target) {
      for (const snapshot of runs.values()) {
        if (snapshot.workspace !== workspace || snapshot.target !== target) continue;
        if (snapshot.status === 'running' || snapshot.status === 'needs-login') return snapshot as S;
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
          (snapshot) => LIVE.has(snapshot.status) || epochOf(snapshot.at) >= floor,
        )
        .reverse()
        .map((snapshot) => ({ ...deps.view(snapshot as S), id: snapshot.id }));
    },

    live() {
      return [...runs.values()].filter((snapshot) => LIVE.has(snapshot.status)) as S[];
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
        const extra = deps.step?.(step, current) ?? {};
        if (step.loginUrl !== undefined) {
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
            status: current.status === 'needs-login' ? 'running' : current.status,
            step: step.text,
            steps,
            ...(current.status === 'needs-login' ? { loginUrl: undefined } : {}),
          },
          { kind: 'step', step },
        );
      };

      const control = new AbortController();
      controls.set(id, control);

      void deps
        .run({ payload: options.payload, onStep, signal: control.signal })
        .then((result) => {
          const current = live(id);
          if (current === null) return;
          controls.delete(id);
          patch(
            id,
            { status: 'ok', ...(deps.outcome?.(result, current) ?? {}), loginUrl: undefined },
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
              loginUrl: undefined,
            },
            { kind: 'settle' },
          );
        });

      return runs.get(id) as S;
    },

    stop(id, by) {
      const current = live(id);
      if (current === null) return false;
      controls.get(id)?.abort();
      controls.delete(id);
      patch(
        id,
        { ...(deps.stopped?.(current) ?? {}), status: 'stopped', loginUrl: undefined },
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
  if (existing !== undefined && isRegistry(existing)) return existing as unknown as LongTaskRegistry<S>;
  const created = createLongTaskRegistry(deps);
  store[slot] = created;
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
