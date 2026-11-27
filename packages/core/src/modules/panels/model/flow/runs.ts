import type { DiyFlowJournal, DiyFlowSnapshot, FlowHost, FlowNodeStep, FlowProvideResult, FlowSession } from '@dsh-workbench/shared/host';
import type { DiyFlow } from './definitions';
import { flowById, flowFor } from './definitions';

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

const noJournal: DiyFlowJournal = {
  read: () => null,
  write: () => {},
};

export function createDiyFlowRuns(options: {
  readonly host: FlowHost;
  readonly flow: DiyFlow;
  readonly onEnd: (session: string) => void;
  readonly journal?: DiyFlowJournal | undefined;
}): DiyFlowRuns {
  const runs = new Map<string, Run>();
  const listeners = new Set<(session: string) => void>();
  const journal = options.journal ?? noJournal;

  const notify = (session: string): void => {
    for (const listener of [...listeners]) listener(session);
  };

  const stepAt = (run: Run): FlowNodeStep | null => {
    const position = run.session.current();
    if (position === null) return null;
    return run.flow.steps.find((step) => step.id === position.stepId) ?? null;
  };

  const snapshotOf = (
    run: Run,
    step: FlowNodeStep | null,
    status: DiyFlowSnapshot['status'],
    values: Readonly<Record<string, unknown>> = run.values,
  ): DiyFlowSnapshot => ({
    version: 1,
    flow: run.flow.id,
    input: run.input,
    step: step === null ? null : step.id,
    values,
    status,
  });

  const finish = (
    session: string,
    run: Run,
    status: DiyFlowSnapshot['status'],
    values: Readonly<Record<string, unknown>>,
  ): void => {
    if (runs.get(session) !== run) return;
    runs.delete(session);
    journal.write(session, snapshotOf(run, null, status, values));
    notify(session);
    options.onEnd(session);
  };

  const watch = (session: string, run: Run): void => {
    void run.session.result
      .then((result) => {
        finish(session, run, result.status === 'stopped' ? 'stopped' : 'done', result.steps);
      })
      .catch((error: unknown) => {
        console.warn('[dsh-workbench] 流程状态写入失败：', error);
      });
  };

  const hydrate = (session: string): Run | null => {
    const existing = runs.get(session);
    if (existing !== undefined) return existing;
    let snapshot: DiyFlowSnapshot | null;
    try {
      snapshot = journal.read(session);
    } catch (error) {
      console.warn('[dsh-workbench] 读流程状态失败：', error);
      return null;
    }
    if (snapshot === null || snapshot.status !== 'running' || snapshot.step === null) return null;
    const flow = flowById(snapshot.flow);
    if (flow === null) return null;
    try {
      const session_ = options.host.open({
        flow,
        input: snapshot.input,
        onStep: () => {},
        resume: { stepId: snapshot.step, values: snapshot.values },
      });
      const run: Run = {
        flow,
        session: session_,
        input: snapshot.input,
        values: { ...snapshot.values },
      };
      runs.set(session, run);
      watch(session, run);
      notify(session);
      return run;
    } catch (error) {
      console.warn('[dsh-workbench] 恢复流程状态失败：', error);
      return null;
    }
  };

  const runOf = (session: string): Run | null => {
    const existing = runs.get(session);
    if (existing !== undefined) return existing;
    return hydrate(session);
  };

  return {
    stepOf(session) {
      const run = runOf(session);
      return run === null ? null : stepAt(run);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    valuesOf(session) {
      return runOf(session)?.values ?? {};
    },

    inputOf(session) {
      return runOf(session)?.input ?? {};
    },

    flowOf(session) {
      const run = runOf(session);
      return run === null ? null : run.flow;
    },

    start(session, input = {}) {
      const existing = runOf(session);
      if (existing !== null) {
        const step = stepAt(existing);
        if (step !== null) return step;
        runs.delete(session);
      }
      const flow = flowFor(input['destination']);
      const session_ = options.host.open({ flow, input, onStep: () => {} });
      const run: Run = { flow, session: session_, input, values: {} };
      const step = stepAt(run);
      if (step === null) throw new Error('流程一步都走不了，检查定义');
      runs.set(session, run);
      try {
        journal.write(session, snapshotOf(run, step, 'running'));
      } catch (error) {
        run.session.abort();
        runs.delete(session);
        throw error;
      }
      watch(session, run);
      notify(session);
      return step;
    },

    provide(session, value) {
      const run = runOf(session);
      if (run === null) return { ok: false, problem: '这条会话没有运行中的流程' };
      const position = run.session.current();
      if (position === null) return { ok: false, problem: '这条流程已经走完' };
      const provided = run.session.provide(position.stepId, value);
      if (provided.ok) run.values[position.stepId] = value;
      return provided;
    },

    async advance(session, value) {
      const run = runOf(session);
      if (run === null) return { ok: false, problem: '这条会话没有运行中的流程', step: null };
      const before = run.session.current()?.stepId ?? undefined;
      if (before === undefined) return { ok: false, problem: '这条流程已经走完', step: null };
      const provided = run.session.provide(before, value);
      if (!provided.ok) return { ok: false, problem: provided.problem, step: stepAt(run) };
      run.values[before] = value;
      for (let round = 0; round < 20; round += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const after = run.session.current()?.stepId ?? undefined;
        if (after !== before) {
          const step = after === undefined ? null : stepAt(run);
          journal.write(session, snapshotOf(run, step, step === null ? 'done' : 'running'));
          notify(session);
          return { ok: true, step };
        }
      }
      const step = stepAt(run);
      journal.write(session, snapshotOf(run, step, step === null ? 'done' : 'running'));
      return { ok: true, step };
    },

    stop(session) {
      const run = runOf(session);
      if (run === null) return;
      run.session.abort();
      runs.delete(session);
      journal.write(session, snapshotOf(run, null, 'stopped'));
      notify(session);
    },
  };
}
