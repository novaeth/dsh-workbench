import type { FlowOpenOptions, FlowResult, FlowSession, FlowStepEvent, FlowStepPosition } from './types.js';
import { evalPredicate } from './expr.js';
import { targetOf } from './run.js';
import { schemaProblem } from './schema.js';

export function openFlow(options: FlowOpenOptions): FlowSession {
  const steps: Record<string, unknown> = {};
  let current: FlowStepPosition | null = null;
  let schemaOfCurrent: unknown;
  let pending: { readonly stepId: string; readonly resolve: (value: unknown) => void } | null = null;
  let stopped = false;
  let settle: (result: FlowResult) => void = () => {};

  const emit = (event: FlowStepEvent): void => {
    try {
      options.onStep(event);
    } catch {
    }
  };

  const result = new Promise<FlowResult>((resolve) => {
    settle = resolve;
  });

  const wait = (stepId: string): Promise<unknown> =>
    new Promise<unknown>((resolve) => {
      pending = { stepId, resolve };
    });

  void (async () => {
    for (const [index, step] of options.flow.steps.entries()) {
      if (stopped) break;
      const title = step.title ?? step.id;
      if (step.when !== undefined && !evalPredicate(step.when, { in: options.input, steps })) {
        emit({ stepId: step.id, title, status: 'skipped' });
        continue;
      }
      if (
        options.flow.stopWhen !== undefined &&
        evalPredicate(options.flow.stopWhen, { in: options.input, steps })
      ) {
        break;
      }
      current = { index, stepId: step.id, title };
      schemaOfCurrent = 'schema' in step ? step.schema : undefined;
      emit({ stepId: step.id, title, status: 'running' });
      const value = await wait(step.id);
      pending = null;
      if (stopped) break;
      steps[step.id] = value;
      current = null;
    }
    settle({
      status: stopped ? 'stopped' : 'ok',
      target: targetOf(options.flow, { in: options.input, steps }),
      steps,
    });
  })();

  return {
    result,
    current: () => current,
    provide(stepId, value) {
      if (pending === null || pending.stepId !== stepId || stopped) {
        return { ok: false, problem: `现在不是在等 ${stepId} 的结果` };
      }
      const problem = schemaProblem(value, schemaOfCurrent, '结果');
      if (problem !== null) return { ok: false, problem };
      const resolve = pending.resolve;
      pending = null;
      resolve(value);
      return { ok: true };
    },
    abort() {
      stopped = true;
      const waiting = pending;
      pending = null;
      waiting?.resolve(undefined);
    },
  };
}

