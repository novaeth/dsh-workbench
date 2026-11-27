import {
  longTaskProgressIsValid,
  type LongTaskPlanStep,
  type LongTaskProgress,
  type LongTaskStepRow,
} from '../../contract/long-task.js';

export function nextLongTaskProgress(
  next: LongTaskProgress,
  current: LongTaskProgress | undefined,
): LongTaskProgress | null {
  if (!longTaskProgressIsValid(next)) return null;
  if (current === undefined) return { done: next.done, total: next.total };
  if (current.total !== next.total) return { done: next.done, total: next.total };
  if (next.done < current.done) return current;
  return { done: next.done, total: next.total };
}

export function derivedLongTaskProgress(
  history: readonly LongTaskStepRow[],
  total: number,
  plan: readonly LongTaskPlanStep[],
): LongTaskProgress | undefined {
  if (total <= 0) return undefined;
  const wanted = new Set(plan.map((step) => step.id));
  const done = new Set<string>();
  for (const row of history) {
    if (row.stepId === undefined) continue;
    if (wanted.size === 0) {
      if (row.kind === 'succeed') done.add(row.stepId);
      continue;
    }
    if (row.kind !== 'succeed' && row.kind !== 'info') continue;
    if (wanted.has(row.stepId)) done.add(row.stepId);
  }
  return { done: Math.min(done.size, total), total };
}
