import type { DshPromptAssembly } from '@dsh-workbench/shared/host';
import type { ToolScopeContext } from '@dsh-workbench/shared/host';

export interface ScopedToolRegistry {
  restrict(filter: { readonly allow?: readonly string[]; readonly deny?: readonly string[] }): () => void;
}

export interface ToolScopeAgent {
  readonly ctx?:
    | {
        readonly tools?: ScopedToolRegistry | undefined;
        get?<T = unknown>(name: string): T | undefined;
      }
    | undefined;
  readonly session?:
    | {
        readonly id?: string | undefined;
        readonly header?: { readonly cwd?: string | undefined; readonly agentPreset?: string | undefined } | undefined;
      }
    | undefined;
}

export interface ToolScopeOptions {
  deniedTools(context: ToolScopeContext): readonly string[];
  extraDenied?: ((assembly: DshPromptAssembly, context: ToolScopeContext) => readonly string[]) | undefined;
  presetOf?: ((handle: ToolScopeAgent) => string | null) | undefined;
  logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

export interface ToolScope {
  apply(agent: unknown): void;
  narrow(assembly: DshPromptAssembly, agent: unknown): DshPromptAssembly;
  reapply(): void;
  disposeAll(): void;
}

function agentOf(value: unknown): ToolScopeAgent | undefined {
  return typeof value === 'object' && value !== null ? (value as ToolScopeAgent) : undefined;
}

export type PresetReader = (handle: ToolScopeAgent) => string | null;

export function toolScopeContextOf(agent: unknown, presetOf?: PresetReader | undefined): ToolScopeContext | null {
  const handle = agentOf(agent);
  if (handle === undefined) return null;
  const header = handle.session?.header;
  const cwd = header?.cwd;
  const declared = header?.agentPreset;
  const session = handle.session?.id;
  const read = presetOf?.(handle);
  return {
    workspace: typeof cwd === 'string' && cwd !== '' ? cwd : null,
    preset: read ?? (typeof declared === 'string' && declared !== '' ? declared : null),
    session: typeof session === 'string' && session !== '' ? session : null,
    scope: handle,
  };
}

export function createToolScope(options: ToolScopeOptions): ToolScope {
  const applied = new WeakMap<object, { signature: string; dispose: () => void }>();
  const seen = new Set<WeakRef<object>>();

  function toolsOf(handle: ToolScopeAgent): ScopedToolRegistry | undefined {
    const byProperty = handle.ctx?.tools;
    if (byProperty?.restrict !== undefined) return byProperty;
    const byGet = handle.ctx?.get?.('tools') as ScopedToolRegistry | undefined;
    return byGet?.restrict === undefined ? undefined : byGet;
  }

  function sync(handle: ToolScopeAgent): void {
    const tools = toolsOf(handle);
    if (tools === undefined) {
      options.logger?.warn?.('[dsh-workbench] 拿不到 agent 作用域的工具面：本次不限制（下次再试）');
      return;
    }

    const context = toolScopeContextOf(handle, options.presetOf);
    if (context === null) return;
    const deny = [...options.deniedTools(context)];
    const signature = `${context.workspace ?? ''}\u0000${context.preset ?? ''}\u0000${context.session ?? ''}\u0000${deny.join(',')}`;

    const previous = applied.get(handle);
    if (previous !== undefined && previous.signature === signature) return;
    if (previous === undefined) seen.add(new WeakRef(handle));
    previous?.dispose();

    if (deny.length === 0) {
      options.logger?.info?.('[dsh-workbench] 这个工作区启用了全部模块：不限制工具面');
      applied.delete(handle);
      return;
    }
    const where = context.preset === null ? context.workspace : `${context.workspace ?? '(未知工作区)'} · ${context.preset}`;
    try {
      applied.set(handle, { signature, dispose: tools.restrict({ deny }) });
      options.logger?.info?.(
        `[dsh-workbench] 按会话限制工具面：${where ?? '(未知工作区)'} 里收起 ${deny.length} 个工具（${deny.join(', ')}）`,
      );
    } catch (error) {
      options.logger?.warn?.(`[dsh-workbench] 限制工具面失败：${String(error)}`);
    }
  }

  return {
    apply(agent) {
      const handle = agentOf(agent);
      if (handle === undefined) return;
      sync(handle);
    },
    narrow(assembly, agent) {
      const tools = assembly?.tools;
      const context = toolScopeContextOf(agent, options.presetOf);
      if (context === null || tools === undefined) return assembly;
      const deny = new Set([
        ...options.deniedTools(context),
        ...(options.extraDenied?.(assembly, context) ?? []),
      ]);
      if (deny.size === 0) return assembly;
      const kept = tools.filter((tool) => !deny.has(tool.name));
      return kept.length === tools.length ? assembly : { ...assembly, tools: kept };
    },
    reapply() {
      for (const ref of [...seen]) {
        const handle = ref.deref();
        if (handle === undefined) seen.delete(ref);
        else sync(handle as ToolScopeAgent);
      }
    },
    disposeAll() {
      for (const ref of [...seen]) {
        const handle = ref.deref();
        if (handle === undefined) continue;
        applied.get(handle)?.dispose();
        applied.delete(handle);
      }
      seen.clear();
    },
  };
}
