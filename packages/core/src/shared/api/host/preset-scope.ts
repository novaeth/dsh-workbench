import type { DshHostContext } from '@dsh-workbench/shared/host';
import { SESSION_PROJECTIONS_SERVICE, type ToolScopeContext } from '@dsh-workbench/shared/host';
import type { DshPromptAssembly } from '@dsh-workbench/shared/host';
import { createToolScope, type ToolScope, type ToolScopeAgent } from './tool-scope';

export type SessionProjections = DshHostContext['sessionProjections'];

type ProjectionSession = Parameters<SessionProjections['stateOf']>[0];

export interface PresetScopeOptions {
  readonly ctx: DshHostContext;
  readonly deniedTools: (context: ToolScopeContext) => readonly string[];
  readonly extraDenied?:
    | ((assembly: DshPromptAssembly, context: ToolScopeContext) => readonly string[])
    | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

const PRESET_KEY = 'agentPreset';

export function presetOfSession(ctx: DshHostContext, handle: ToolScopeAgent): string | null {
  const projections = ctx.get(SESSION_PROJECTIONS_SERVICE);
  if (projections === undefined || handle.session === undefined) return null;
  try {
    const preset = projections.stateOf(handle.session as ProjectionSession, PRESET_KEY);
    return typeof preset === 'string' && preset !== '' ? preset : null;
  } catch (error: unknown) {
    ctx.logger?.warn?.(`[dsh-workbench] 读 preset 投影失败，退回会话创建事实：${String(error)}`);
    return null;
  }
}

function watchPreset(ctx: DshHostContext, listener: () => void): void {
  ctx.inject([SESSION_PROJECTIONS_SERVICE], (scoped) => {
    const projections = scoped.get(SESSION_PROJECTIONS_SERVICE);
    if (projections === undefined) return;
    scoped.effect(() => {
      const off = projections.onChanged((_session, key) => {
        if (key === PRESET_KEY) listener();
      });
      return () => off?.();
    }, 'dsh-workbench: preset 选中就重算工具面（新会话屏是先建会话、再把选择 select 上去）');
  });
}

export function createPresetScope(options: PresetScopeOptions): ToolScope {
  const scope = createToolScope({
    deniedTools: options.deniedTools,
    ...(options.extraDenied === undefined ? {} : { extraDenied: options.extraDenied }),
    presetOf: (handle) => presetOfSession(options.ctx, handle),
    logger: options.logger,
  });
  watchPreset(options.ctx, () => scope.reapply());
  return scope;
}
