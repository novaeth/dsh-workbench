import { longTaskRowBase, type LongTaskBase, type LongTaskRegistry } from '@dsh-workbench/shared/host';
import type { ShellLongTaskRow } from '@/kernel/contract/long-tasks';

function snapshotsOf(registry: LongTaskRegistry<LongTaskBase>): readonly LongTaskBase[] {
  if (typeof registry.recent === 'function') return registry.recent();
  if (typeof registry.live === 'function') return registry.live();
  return [];
}

export function shellLongTaskRows(
  runs: ReadonlyMap<string, LongTaskRegistry<LongTaskBase>>,
): ShellLongTaskRow[] {
  const rows: ShellLongTaskRow[] = [];
  for (const [unit, registry] of runs) {
    for (const snapshot of snapshotsOf(registry)) {
      rows.push({
        unit,
        id: snapshot.id,
        workspace: snapshot.workspace,
        ...longTaskRowBase(snapshot),
        ...(registry.resumable === true ? { resumable: true } : {}),
        ...(registry.answerable === true ? { answerable: true } : {}),
      });
    }
  }
  return rows;
}
