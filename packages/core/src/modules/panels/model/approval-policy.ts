import type {
  ApprovalCall,
  ApprovalPolicy,
  ApprovalVerdict,
  RecordState,
} from '@dsh-workbench/shared/host';
import type { MarketSourcesStore } from '@/shared/api/host/market-sources-store';
import { DIY_PUBLISH_TOOL, DIY_RECORD_PREPARE_TOOL, LONG_TASKS_STOP_TOOL } from '../unit';
import type { LongTaskRunsLookup } from './long-task-tools';
import { recordRefusalText } from './diy-record-text';
import {
  approvalVerdict,
  publishVerdictFor,
  stopVerdictFor,
  type MarketSourceLookup,
  type PublishApprovalPreview,
} from './approval';
import type { Toolbox } from './toolbox';

export const panelsApproval: ApprovalPolicy = (call) => approvalVerdict(call);

function recordHeldVerdict(
  call: ApprovalCall,
  recording: (() => RecordState | null) | undefined,
): ApprovalVerdict | undefined {
  if (call.name !== DIY_RECORD_PREPARE_TOOL || recording === undefined) return undefined;
  const held = recording();
  if (held === null) return undefined;
  const code = held.sessionId === call.session ? 'already-held' : 'held-by-other';
  return { kind: 'deny', reason: recordRefusalText(code, held) };
}

export function panelsApprovalFor(
  longTaskRuns?: LongTaskRunsLookup | undefined,
  recording?: (() => RecordState | null) | undefined,
  publishPreview?: ((unit: string, author?: string) => PublishApprovalPreview | null) | undefined,
  marketSources?: MarketSourcesStore | undefined,
  toolbox?: Toolbox | undefined,
): ApprovalPolicy {
  const sourceOf: MarketSourceLookup | undefined =
    marketSources === undefined
      ? undefined
      : (id) => {
          const payload = marketSources.read();
          const wanted = id === undefined || id === '' ? payload.selected : id;
          return wanted === null ? undefined : payload.sources.find((one) => one.id === wanted);
        };
  return (call) => {
    if (call.name === LONG_TASKS_STOP_TOOL) return stopVerdictFor(call, longTaskRuns);
    if (call.name === DIY_PUBLISH_TOOL) return publishVerdictFor(call, publishPreview);
    return recordHeldVerdict(call, recording) ?? approvalVerdict(call, sourceOf, toolbox);
  };
}
