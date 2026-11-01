import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { WORKBENCH_SHELL, dshHome, withSandboxPolicy } from '@dsh-workbench/shared/host';

export const SHELL_SANDBOX_POLICY = { mode: 'workspace-write', workspaceRoot: dshHome() } as const;

export function provideWorkbenchShell(ctx: DshHostContext): DshShell | undefined {
  const raw = ctx.get<DshShell>('shell');
  if (raw === undefined) return undefined;
  const shell = withSandboxPolicy(raw, SHELL_SANDBOX_POLICY);
  ctx.provide(WORKBENCH_SHELL, shell);
  ctx.logger?.info?.(`[dsh-workbench] 执行缝的可写根：${SHELL_SANDBOX_POLICY.workspaceRoot}`);
  return shell;
}
