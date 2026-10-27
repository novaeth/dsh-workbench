import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared';
import { approvalFor, type ApprovalCall, type ToolUnit, type UnitMountResult } from '@dsh-workbench/shared/host';
import { approvalCallOf } from './approval-call';
import { fullPermissionOf } from './permission-mode';

export interface ApprovalGateExec {
  readonly name?: string;
  readonly arguments?: unknown;
  readonly agent?: DshToolRunContext['agent'];
}

export type ApprovalGateDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'ask'; readonly reason?: string; readonly displayReason?: Record<string, string> };

export interface ApprovalGateDeps {
  readonly ctx: DshHostContext;
  readonly toolOf: (name: string) => ToolUnit | undefined;
  readonly faceOf: (unit: string) => UnitMountResult | undefined;
  readonly declaredNotes: () => ReadonlySet<string>;
}

export function createApprovalGate(
  deps: ApprovalGateDeps,
): (exec: ApprovalGateExec, next: () => Promise<ApprovalGateDecision>) => Promise<ApprovalGateDecision> {
  return async (exec, next) => {
    const decision = await next();
    if (decision.kind !== 'allow') return decision;
    const name = exec.name === undefined ? undefined : String(exec.name);
    const tool = name === undefined ? undefined : deps.toolOf(name);
    const owner = tool === undefined ? undefined : deps.faceOf(tool.unit);
    const detailOf = owner === undefined ? undefined : (call: ApprovalCall) => owner.approvalDetail?.(call);
    const call = approvalCallOf(exec, name);
    const policy = owner?.needsApproval;
    const declaredNote = name !== undefined && deps.declaredNotes().has(name);
    const writes = tool?.writes ?? false;
    const skipAsk = writes && fullPermissionOf(deps.ctx, exec.agent);
    return (await approvalFor(call, { detailOf, policy, writes, declaredNote, skipAsk })) ?? decision;
  };
}
