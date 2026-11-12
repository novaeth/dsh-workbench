import type { DshToolRunContext } from '@dsh-workbench/shared/host';
import { sessionIdOf, sessionWorkspace, type ApprovalCall } from '@dsh-workbench/shared/host';

export interface ApprovalExec {
  readonly arguments?: unknown;
  readonly agent?: { readonly session?: unknown } | undefined;
}

export function approvalCallOf(exec: ApprovalExec | undefined, name: string | undefined): ApprovalCall {
  const workspace = sessionWorkspace(exec as DshToolRunContext | undefined) ?? undefined;
  const session = sessionIdOf(exec as DshToolRunContext | undefined) ?? undefined;
  return {
    ...(name === undefined ? {} : { name }),
    arguments: exec?.arguments,
    ...(workspace === undefined ? {} : { workspace }),
    ...(session === undefined ? {} : { session }),
  };
}
