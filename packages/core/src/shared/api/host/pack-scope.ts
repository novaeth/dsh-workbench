import type { DshHostContext, DshPromptAssembly } from '@dsh-workbench/shared';
import {
  MCP_TOOLS_SERVICE,
  TOOLBOX_SERVICE,
  type McpToolsPort,
  type ToolboxPort,
  type ToolScopeContext,
} from '@dsh-workbench/shared/host';
import { createMcpPacks, type McpPacks } from './mcp-packs';
import type { WorkbenchSettingsStore } from './workbench-settings';

export interface McpScope {
  extraDenied(assembly: DshPromptAssembly, context: ToolScopeContext): readonly string[];
  denied(context: ToolScopeContext): readonly string[];
}

function openMatcher(ctx: DshHostContext, context: ToolScopeContext): (pack: string) => boolean {
  const box = ctx.get<ToolboxPort>(TOOLBOX_SERVICE);
  if (box === undefined) return () => true;
  const open = box.packsOf(context.session, context.preset);
  return (pack) => open.has(pack);
}

function deniedFor(ctx: DshHostContext, packs: McpPacks, context: ToolScopeContext): readonly string[] {
  return packs.deniedFor(openMatcher(ctx, context));
}

export function createMcpScope(options: {
  readonly ctx: DshHostContext;
  readonly reapply: () => void;
  readonly settings: WorkbenchSettingsStore;
}): McpScope {
  const { ctx, reapply, settings } = options;
  const enabled = (): boolean => settings.read().mcpOnDemand;
  const packs = createMcpPacks();
  const port: McpToolsPort = { servers: () => (enabled() ? packs.servers() : []) };
  ctx.provide(MCP_TOOLS_SERVICE, port);
  ctx.effect(() => settings.watch(() => reapply()), 'dsh-workbench: MCP 按需加载开关一变就重算工具面');

  return {
    extraDenied(assembly, context) {
      if (!enabled()) return [];
      if (packs.observe(assembly)) reapply();
      return deniedFor(ctx, packs, context);
    },
    denied(context) {
      return enabled() ? deniedFor(ctx, packs, context) : [];
    },
  };
}
