import type { DshHostContext } from '@dsh-workbench/shared/host';
import { approvalFor, type ApprovalCall, type ToolUnit, type UnitMountResult } from '@dsh-workbench/shared/host';
import { approvalCallOf } from './approval-call';
import { fullPermissionOf } from './permission-mode';

export interface ApprovalGateExec {
  readonly name?: string;
  readonly arguments?: unknown;
  readonly agent?: { readonly session?: unknown } | undefined;
}

export type ApprovalGateDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'cancel' }
  | Exclude<Awaited<ReturnType<typeof approvalFor>>, undefined>;

export interface ApprovalGateDeps {
  readonly ctx: DshHostContext;
  readonly toolOf: (name: string) => ToolUnit | undefined;
  readonly faceOf: (unit: string) => UnitMountResult | undefined;
  readonly declaredNotes: () => ReadonlySet<string>;
  readonly deniedReasonOf?: ((name: string, agent: unknown) => string | undefined) | undefined;
}

export function createApprovalGate(
  deps: ApprovalGateDeps,
): (exec: ApprovalGateExec, next: () => Promise<ApprovalGateDecision>) => Promise<ApprovalGateDecision> {
  return async (exec, next) => {
    const name = exec.name === undefined ? undefined : String(exec.name);
    const closed = name === undefined ? undefined : deps.deniedReasonOf?.(name, exec.agent);
    if (closed !== undefined) return { kind: 'deny', reason: closed };
    const decision = await next();
    if (decision.kind !== 'allow') return decision;
    const tool = name === undefined ? undefined : deps.toolOf(name);
    const owner = tool === undefined ? undefined : deps.faceOf(tool.unit);
    const detailOf = owner === undefined ? undefined : (call: ApprovalCall) => owner.approvalDetail?.(call);
    const call = approvalCallOf(exec, name);
    const policy = owner?.needsApproval;
    const declaredNote = name !== undefined && deps.declaredNotes().has(name);
    const writes = tool?.writes ?? false;
    const elevates = tool?.elevates ?? false;
    const skipAsk = (writes || elevates) && fullPermissionOf(deps.ctx, exec.agent);
    return (
      (await approvalFor(call, { detailOf, policy, writes, elevates, declaredNote, skipAsk })) ?? decision
    );
  };
}
