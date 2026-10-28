import type { DshHostContext } from '@dsh-workbench/shared';
import type { AdapterSet } from '@dsh-workbench/shared/host';
import { ADAPTER_SET_API_VERSION, runningVersionOf } from '@dsh-workbench/shared/host';
import { createProbePort, readSelfUpdateView } from '@dsh-workbench/adapter-probe';
import { createHostActions } from '@dsh-workbench/adapter-profile';
import { dshPluginsHandler, profileDirOf } from '@dsh-workbench/adapter-supply';
import { createMcpClient } from './mcp-client.js';
import { createMcpDataReader } from './data-reader.js';
import { createPluginSurface } from './plugin-surface.js';
import { createRuntimePort, mcpServerCommand } from './runtime-port.js';
import { createSupplyPort } from './supply-port.js';

export const CHROME_MCP_ADAPTER_SET_ID = '@dsh-workbench/adapters-chrome-mcp';

export interface McpAdapterSetOptions {
  readonly server?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
}

export function createAdapterSet(ctx: DshHostContext, options: McpAdapterSetOptions = {}): AdapterSet {
  const server = options.server ?? mcpServerCommand(options.env ?? process.env);
  const client = createMcpClient({
    command: server,
    args: options.args ?? [],
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  const supply = createSupplyPort();
  return {
    apiVersion: ADAPTER_SET_API_VERSION,
    id: CHROME_MCP_ADAPTER_SET_ID,
    version: runningVersionOf(import.meta.url) ?? '0.0.0',
    data: createMcpDataReader({ call: (name, args) => client.callTool(name, args) }),
    supply,
    modules: supply,
    profile: {
      dirOf: profileDirOf,
      dshPlugins: dshPluginsHandler,
      selfUpdateView: readSelfUpdateView,
    },
    probe: createProbePort(),
    runtime: createRuntimePort(),
    plugins: createPluginSurface(),
    actions: createHostActions(),
  };
}
