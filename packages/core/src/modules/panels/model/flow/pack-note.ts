import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared/host';
import { TOOLBOX_SERVICE, sessionIdOf } from '@dsh-workbench/shared/host';
import { presetOfSession } from '@/shared/api/host/preset-scope';
import { toolScopeContextOf } from '@/shared/api/host/tool-scope';
import { flowPacksOf } from '../toolbox';

interface PackPort {
  packsOf(session: string | null, preset: string | null): ReadonlySet<string>;
}

export function packNoteOf(ctx: DshHostContext, exec: DshToolRunContext, step: string | null): string {
  if (step === null) return '';
  const session = sessionIdOf(exec);
  if (session === null) return '';
  const context = toolScopeContextOf(exec.agent, (handle) => presetOfSession(ctx, handle));
  if (context === null) return '';
  const port = ctx.get(TOOLBOX_SERVICE) as PackPort | undefined;
  if (port === undefined) return '';
  const open = port.packsOf(session, context.preset);
  const missing = flowPacksOf(step).filter((pack) => !open.has(pack));
  if (missing.length === 0) return '';
  return `这一步需要工具包 ${missing.join(' / ')}，当前未启用。请先调用 workbench_toolbox_open 打开，再继续。`;
}
