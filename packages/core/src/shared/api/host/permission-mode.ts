import type { DshApprovalService, DshHostContext } from '@dsh-workbench/shared/host';

type ApprovalSession = Parameters<DshApprovalService['overrideOf']>[0];

export function fullPermissionOf(
  ctx: DshHostContext,
  agent: { readonly session?: unknown } | undefined,
): boolean {
  const session = agent?.session;
  if (session === undefined || session === null) return false;

  try {
    const approval = ctx.get('approval');
    const policy = approval?.overrideOf(session as ApprovalSession) ?? approval?.config.policy ?? 'ask';
    if (policy !== 'never') return false;
    const sandbox = ctx.get('sandboxPolicy');
    return sandbox?.resolve({ session: session as ApprovalSession })?.mode === 'danger-full-access';
  } catch {
    return false;
  }
}
