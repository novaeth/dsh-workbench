import { homedir } from 'node:os';
import type { DshHostContext, DshSandboxPolicy, DshShell } from '@dsh-workbench/shared';
import {
  WORKBENCH_SEAM,
  createSeam,
  seamModeOf,
  workbenchRoot,
  type Seam,
  type SeamPolicy,
} from '@dsh-workbench/shared/host';

export function provideWorkbenchSeam(ctx: DshHostContext): Seam | undefined {
  const shell = ctx.get<DshShell>('shell');
  if (shell === undefined) return undefined;
  const runtimeRoot = workbenchRoot();
  const seam = createSeam({
    shell,
    runtimeRoot,
    realHome: homedir(),
    logger: ctx.logger,
    grantOf: (session): SeamPolicy | undefined => {
      const resolved = ctx.get<DshSandboxPolicy>('sandboxPolicy')?.resolve?.({ session });
      if (resolved === undefined || resolved.mode === undefined || resolved.workspaceRoot === undefined) {
        return undefined;
      }
      return { mode: seamModeOf(resolved.mode), workspaceRoot: resolved.workspaceRoot };
    },
  });
  ctx.provide(WORKBENCH_SEAM, seam);
  ctx.logger?.info?.(`[dsh-workbench] 执行缝：产品域 ${runtimeRoot}`);
  return seam;
}
