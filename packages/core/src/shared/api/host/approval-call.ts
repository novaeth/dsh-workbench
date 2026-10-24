import type { DshToolRunContext } from '@dsh-workbench/shared';
import { sessionIdOf, sessionWorkspace, type ApprovalCall } from '@dsh-workbench/shared/host';

export interface ApprovalExec {
  readonly arguments?: unknown;
  readonly agent?: DshToolRunContext['agent'];
}

export function approvalCallOf(exec: ApprovalExec | undefined, name: string | undefined): ApprovalCall {
  const workspace = sessionWorkspace(exec) ?? undefined;
  const session = sessionIdOf(exec) ?? undefined;
  return {
    ...(name === undefined ? {} : { name }),
    arguments: exec?.arguments,
    ...(workspace === undefined ? {} : { workspace }),
    ...(session === undefined ? {} : { session }),
  };
}
