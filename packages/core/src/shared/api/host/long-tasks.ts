import type { LongTaskBase, LongTaskRegistry } from '@dsh-workbench/shared/host';
import type { ShellLongTaskRow } from '@/kernel/contract/long-tasks';

export function liveLongTaskRows(
  runs: ReadonlyMap<string, LongTaskRegistry<LongTaskBase>>,
): ShellLongTaskRow[] {
  const rows: ShellLongTaskRow[] = [];
  for (const [unit, registry] of runs) {
    if (typeof registry.live !== 'function') continue;
    for (const snapshot of registry.live()) {
      rows.push({
        unit,
        id: snapshot.id,
        workspace: snapshot.workspace,
        target: snapshot.target,
        ...(snapshot.headline === undefined ? {} : { headline: snapshot.headline }),
        status: snapshot.status,
        step: snapshot.step,
        steps: snapshot.steps,
        ...(snapshot.intervention === undefined ? {} : { intervention: snapshot.intervention }),
        ...(snapshot.loginUrl === undefined ? {} : { loginUrl: snapshot.loginUrl }),
        ...(snapshot.why === undefined ? {} : { why: snapshot.why }),
        ...(snapshot.session === undefined ? {} : { session: snapshot.session }),
      });
    }
  }
  return rows;
}
