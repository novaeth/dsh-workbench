import type { CallOverrides, DataReader, DataRequest, DataResult, RecipeCalls, RecipeResults, RequestRecipe } from '@dsh-workbench/shared';
import { CHROME_MCP_RUNTIME } from './runtime-port.js';

export interface McpDataReaderOptions {
  readonly call: (name: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
}

function failure(message: string, detail?: string): DataResult<never> {
  return {
    ok: false,
    error: detail === undefined ? { code: 'invalid-request', message } : { code: 'invalid-request', message, detail },
  };
}

function unsupported(kind: string): DataResult<never> {
  return failure(`${CHROME_MCP_RUNTIME} 没有 ${kind} 通道`, `这个适配器只做浏览器读：DataRequest 用 kind: 'browser'。`);
}

export function createMcpDataReader(options: McpDataReaderOptions): DataReader {
  async function read<T = unknown>(request: DataRequest): Promise<DataResult<T>> {
    if (request.kind === 'browser') {
      try {
        if (request.url !== undefined && request.url !== '') {
          await options.call('browser_navigate', { url: request.url });
        }
        const value = await options.call('browser_evaluate', { script: request.script });
        return { ok: true, data: value as T };
      } catch (error) {
        return {
          ok: false,
          error: { code: 'browser', message: error instanceof Error ? error.message : String(error) },
        };
      }
    }
    if (request.kind === 'http') return unsupported('http');
    return unsupported('command');
  }

  return {
    read,
    async request<T = unknown>(_recipe: RequestRecipe, _overrides?: CallOverrides): Promise<DataResult<T>> {
      return unsupported('recipe');
    },
    async requestMany<T = unknown>(_recipe: RequestRecipe, _calls: RecipeCalls): Promise<RecipeResults<T>> {
      return {};
    },
    async submit<T = unknown>(_recipe: RequestRecipe, _overrides?: CallOverrides): Promise<DataResult<T>> {
      return unsupported('submit');
    },
  };
}
