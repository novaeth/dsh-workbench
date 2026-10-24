import type { DshApprovalService, DshHostContext, DshSandboxPolicy } from '@dsh-workbench/shared';

export function fullPermissionOf(
  ctx: DshHostContext,
  agent: { readonly session?: unknown } | undefined,
): boolean {
  const session = agent?.session;
  if (session === undefined || session === null) return false;

  try {
    const approval = ctx.get<DshApprovalService>('approval');
    if (approval?.effectivePolicy?.(session) !== 'never') return false;
    const sandbox = ctx.get<DshSandboxPolicy>('sandboxPolicy');
    return sandbox?.resolve?.({ session })?.mode === 'danger-full-access';
  } catch {
    return false;
  }
}
