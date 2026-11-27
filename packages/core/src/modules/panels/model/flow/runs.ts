import type { FlowHost, FlowNodeStep, FlowProvideResult, FlowSession } from '@dsh-workbench/shared/host';
import type { DiyFlow } from './definitions';
import { flowFor } from './definitions';

interface Run {
  readonly flow: DiyFlow;
  readonly session: FlowSession;
  readonly input: Readonly<Record<string, unknown>>;
  readonly values: Record<string, unknown>;
}

export interface DiyAdvance {
  readonly ok: boolean;
  readonly problem?: string | undefined;
  readonly step: FlowNodeStep | null;
}

export interface DiyFlowRuns {
  stepOf(session: string): FlowNodeStep | null;
  valuesOf(session: string): Readonly<Record<string, unknown>>;
  inputOf(session: string): Readonly<Record<string, unknown>>;
  flowOf(session: string): DiyFlow | null;
  start(session: string, input?: Readonly<Record<string, unknown>>): FlowNodeStep;
  provide(session: string, value: unknown): FlowProvideResult;
  advance(session: string, value: unknown): Promise<DiyAdvance>;
  stop(session: string): void;
  subscribe(listener: (session: string) => void): () => void;
}

export function createDiyFlowRuns(options: {
  readonly host: FlowHost;
  readonly flow: DiyFlow;
  readonly onEnd: (session: string) => void;
}): DiyFlowRuns {
  const runs = new Map<string, Run>();
  const listeners = new Set<(session: string) => void>();

  const notify = (session: string): void => {
    for (const listener of [...listeners]) listener(session);
  };

  const stepAt = (run: Run): FlowNodeStep | null => {
    const position = run.session.current();
    if (position === null) return null;
    return run.flow.steps.find((step) => step.id === position.stepId) ?? null;
  };

  return {
    stepOf(session) {
      const run = runs.get(session);
      return run === undefined ? null : stepAt(run);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    valuesOf(session) {
      return runs.get(session)?.values ?? {};
    },

    inputOf(session) {
      return runs.get(session)?.input ?? {};
    },

    flowOf(session) {
      return runs.get(session)?.flow ?? null;
    },

    start(session, input = {}) {
      const existing = runs.get(session);
      if (existing !== undefined) {
        const step = stepAt(existing);
        if (step !== null) return step;
        runs.delete(session);
      }
      const flow = flowFor(input['destination']);
      const session_ = options.host.open({ flow, input, onStep: () => {} });
      const run: Run = { flow, session: session_, input, values: {} };
      runs.set(session, run);
      void session_.result.then(() => {
        if (runs.get(session) !== run) return;
        runs.delete(session);
        notify(session);
        options.onEnd(session);
      });
      const step = stepAt(run);
      if (step === null) throw new Error('流程一步都走不了，检查定义');
      notify(session);
      return step;
    },

    provide(session, value) {
      const run = runs.get(session);
      if (run === undefined) return { ok: false, problem: '这条会话没有运行中的流程' };
      const position = run.session.current();
      if (position === null) return { ok: false, problem: '这条流程已经走完' };
      const provided = run.session.provide(position.stepId, value);
      if (provided.ok) run.values[position.stepId] = value;
      return provided;
    },

    async advance(session, value) {
      const run = runs.get(session);
      if (run === undefined) return { ok: false, problem: '这条会话没有运行中的流程', step: null };
      const before = run.session.current()?.stepId ?? undefined;
      if (before === undefined) return { ok: false, problem: '这条流程已经走完', step: null };
      const provided = run.session.provide(before, value);
      if (!provided.ok) return { ok: false, problem: provided.problem, step: stepAt(run) };
      run.values[before] = value;
      for (let round = 0; round < 20; round += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const after = run.session.current()?.stepId ?? undefined;
        if (after !== before) {
          notify(session);
          return { ok: true, step: after === undefined ? null : runs.get(session) === undefined ? null : stepAt(run) };
        }
      }
      return { ok: true, step: stepAt(run) };
    },

    stop(session) {
      const run = runs.get(session);
      if (run === undefined) return;
      run.session.abort();
      runs.delete(session);
      notify(session);
    },
  };
}
