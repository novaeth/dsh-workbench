import type { RuntimeCapabilities, RuntimePort, RuntimeProfile } from '@dsh-workbench/shared/host';
import { createMcpClient, type McpClientOptions } from './mcp-client.js';
import { packageRootOf } from '@dsh-workbench/shared/host';

export const CHROME_MCP_RUNTIME = 'chrome-mcp';
export const CHROME_MCP_INSTALL = 'npx -y chrome-devtools-mcp@latest';
const DEFAULT_SERVER = 'chrome-devtools-mcp';

export function mcpServerCommand(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['DSH_CHROME_MCP_SERVER']?.trim();
  return configured === undefined || configured === '' ? DEFAULT_SERVER : configured;
}

export function mcpCapabilities(): RuntimeCapabilities {
  return {
    console: false,
    pluginMarket: false,
    browserBridge: false,
  };
}

export function mcpProfile(): RuntimeProfile {
  return {
    label: 'Chrome MCP',
    terms: {
      plugin: { zh: 'Chrome MCP 扩展', en: 'Chrome MCP extension' },
      pluginOf: { zh: 'Chrome MCP 的扩展', en: 'a Chrome MCP extension' },
      pluginThing: { zh: 'Chrome MCP 扩展', en: 'a Chrome MCP extension' },
      pluginArea: { zh: 'Chrome MCP 的扩展区', en: 'the Chrome MCP extension area' },
    },
    installHint: {
      zh: `确认 MCP server 起得来：${CHROME_MCP_INSTALL}`,
      en: `Make sure the MCP server starts: ${CHROME_MCP_INSTALL}`,
    },
    diagnose: {
      exec: {
        zh: `这个适配器没有命令行；确认 MCP server 起得来：${CHROME_MCP_INSTALL}`,
        en: `This adapter has no CLI; make sure the MCP server starts: ${CHROME_MCP_INSTALL}`,
      },
      login: {
        zh: '在 Chrome 里打开调试端口，再让 MCP server 连上。',
        en: 'Open the debugging port in Chrome, then let the MCP server connect.',
      },
      bridge: {
        zh: 'Chrome 没连上：先开浏览器，再重连 MCP server。',
        en: 'Chrome is not connected: start the browser first, then reconnect the MCP server.',
      },
    },
  };
}

export function createRuntimePort(options: { readonly server?: McpClientOptions } = {}): RuntimePort {
  return {
    packageRoot: packageRootOf,
    capabilities: mcpCapabilities,
    profile: mcpProfile,
    commands: () => ({}),
    runners: () => ({}),
    health: () => ({
      [CHROME_MCP_RUNTIME]: { command: mcpServerCommand(), source: 'path', isolated: null },
    }),
    seed: () => undefined,
    warnUnwritableRoot: () => undefined,
    check: async () => {
      const client = createMcpClient(
        options.server ?? { command: mcpServerCommand(), args: [], timeoutMs: 10_000 },
      );
      try {
        const tools = await client.listTools();
        return {
          ok: tools.length > 0,
          detail:
            tools.length > 0
              ? `MCP server 起得来（${tools.length} 个工具）`
              : 'MCP server 起来了，但一个工具也没列出来',
        };
      } catch (error) {
        return {
          ok: false,
          detail: `MCP server 起不来：${error instanceof Error ? error.message : String(error)}。装它：${CHROME_MCP_INSTALL}`,
        };
      } finally {
        await client.close();
      }
    },
  };
}
