import type { DshPromptAssembly } from '@dsh-workbench/shared';
import type { McpServerPacks } from '@dsh-workbench/shared/host';

const TOOL_NAME = /^mcp__(.+?)__(.+)$/;

export function mcpServerOf(tool: string): string | undefined {
  const server = TOOL_NAME.exec(tool)?.[1];
  return server === undefined || server === '' ? undefined : server;
}

export interface McpPacks {
  observe(assembly: DshPromptAssembly): boolean;
  servers(): readonly McpServerPacks[];
  deniedFor(open: (packId: string) => boolean): readonly string[];
}

export function createMcpPacks(): McpPacks {
  const servers = new Map<string, Set<string>>();
  const list = (): readonly McpServerPacks[] =>
    [...servers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, tools]) => ({ name, tools: [...tools].sort() }));

  return {
    observe(assembly) {
      let changed = false;
      for (const tool of assembly.tools ?? []) {
        const server = mcpServerOf(tool.name);
        if (server === undefined) continue;
        const bucket = servers.get(server);
        if (bucket === undefined) {
          servers.set(server, new Set([tool.name]));
          changed = true;
          continue;
        }
        if (bucket.has(tool.name)) continue;
        bucket.add(tool.name);
        changed = true;
      }
      return changed;
    },
    servers: list,
    deniedFor(open) {
      return list().flatMap((server) => (open(`mcp:${server.name}`) ? [] : server.tools));
    },
  };
}
