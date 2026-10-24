import type { DshHostContext } from '@dsh-workbench/shared';
import { DIY_DEBUG_SERVICE, DIY_RECORD_SERVICE, registerDiyDebugAct, registerDiyRecordAct } from '@dsh-workbench/shared/host';
import type { DebugStore, RecordStore } from '@dsh-workbench/shared/host';
import { debugActResource, type AgentsLookup } from './diy-debug-act';
import { recordActResource } from './diy-record-act';

export function registerDiyActs(
  ctx: DshHostContext,
  facts: { bump(names: readonly string[]): unknown },
): () => void {
  const log = { bump: (names: readonly string[]) => facts.bump(names) };
  const offDebug = registerDiyDebugAct(
    ctx,
    debugActResource({
      store: () => ctx.get<DebugStore>(DIY_DEBUG_SERVICE),
      agents: () => ctx.get<AgentsLookup>('agents'),
    }),
    log,
  );
  const offRecord = registerDiyRecordAct(
    ctx,
    recordActResource({
      store: () => ctx.get<RecordStore>(DIY_RECORD_SERVICE),
      agents: () => ctx.get<AgentsLookup>('agents'),
    }),
    log,
  );
  return () => {
    offDebug();
    offRecord();
  };
}
