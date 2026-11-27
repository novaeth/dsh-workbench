import type { DshHostContext } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_SERVICE, DIY_RECORD_SERVICE, registerDiyDebugAct, registerDiyRecordAct } from '@dsh-workbench/shared/host';
import type { DebugStore, DiagRecorder, RecordStore } from '@dsh-workbench/shared/host';
import { debugActResource, type AgentsLookup } from './diy-debug-act';
import { recordActResource } from './diy-record-act';

export function registerDiyActs(
  ctx: DshHostContext,
  facts: { bump(names: readonly string[]): unknown },
  diag?: DiagRecorder | undefined,
): () => void {
  const log = { bump: (names: readonly string[]) => facts.bump(names) };
  const agents = (): AgentsLookup | undefined => ctx.get('agents') as AgentsLookup | undefined;
  const debugStore = (): DebugStore | undefined => ctx.get(DIY_DEBUG_SERVICE) as DebugStore | undefined;
  const recordStore = (): RecordStore | undefined => ctx.get(DIY_RECORD_SERVICE) as RecordStore | undefined;
  const offs = [
    registerDiyDebugAct(ctx, debugActResource({ store: debugStore, agents }), log, diag),
    registerDiyRecordAct(ctx, recordActResource({ store: recordStore, agents }), log, diag),
  ];
  return () => offs.forEach((off) => off());
}
