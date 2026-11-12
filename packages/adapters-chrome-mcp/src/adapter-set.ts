import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { AdapterSet, Seam } from '@dsh-workbench/shared/host';
import { ADAPTER_SET_API_VERSION, runningVersionOf, seamOf } from '@dsh-workbench/shared/host';

import { createHostActions } from '@dsh-workbench/shared/host';
import { dshPluginsHandler, profileDirOf } from '@dsh-workbench/shared/host';
import { createMcpClient } from './mcp-client.js';
import { createMcpDataReader } from './data-reader.js';
import { createPluginSurface } from './plugin-surface.js';
import { createRuntimePort, mcpServerCommand } from './runtime-port.js';
import { createSupplyPort } from './supply-port.js';

export const CHROME_MCP_ADAPTER_SET_ID = '@dsh-workbench/adapters-chrome-mcp';

export interface McpAdapterSetOptions {
  readonly seam?: Seam | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly server?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
}

export function createAdapterSet(ctx: DshHostContext, options: McpAdapterSetOptions = {}): AdapterSet {
  const seam = options.seam ?? seamOf(ctx);
  const server = options.server ?? mcpServerCommand(options.env ?? process.env);
  const client =
    seam === undefined
      ? undefined
      : createMcpClient({
          seam,
          command: server,
          args: options.args ?? [],
          ...(options.env === undefined ? {} : { env: options.env }),
        });
  const supply = createSupplyPort();
  return {
    apiVersion: ADAPTER_SET_API_VERSION,
    id: CHROME_MCP_ADAPTER_SET_ID,
    version: runningVersionOf(import.meta.url) ?? '0.0.0',
    data: createMcpDataReader({
      call: (name, args) =>
        client === undefined
          ? Promise.reject(new Error('宿主没给执行缝，MCP 客户端起不来'))
          : client.callTool(name, args),
    }),
    supply,
    modules: supply,
    profile: {
      dirOf: profileDirOf,
      dshPlugins: dshPluginsHandler,
      selfUpdateView: () => undefined,
    },
    probe: {
      probeUnits: async () => [],
      registerPreflight: () => undefined,
      declaredPluginCommands: () => new Map(),
    },
    runtime: createRuntimePort({ ...(seam === undefined ? {} : { seam }) }),
    plugins: createPluginSurface(),
    actions: createHostActions(),
  };
}
