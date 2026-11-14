import type {
  CallOverrides,
  DataCallOptions,
  DataFailure,
  DataReader,
  DataRequest,
  DataResult,
  PlanResults,
  RecipeCalls,
  RecipeResults,
  RequestPlan,
  RequestRecipe,
} from '@dsh-workbench/shared';
import { allSame, planResultsOf, scriptOfPlan } from '@dsh-workbench/shared/host';
import { CHROME_MCP_RUNTIME } from './runtime-port.js';

export interface McpDataReaderOptions {
  readonly call: (name: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
}

function failure(message: string, detail?: string): DataFailure {
  return {
    ok: false,
    error: detail === undefined ? { code: 'invalid-request', message } : { code: 'invalid-request', message, detail },
  };
}

function unsupported(kind: string): DataFailure {
  return failure(`${CHROME_MCP_RUNTIME} 没有 ${kind} 通道`, `这个适配器只做浏览器读：DataRequest 用 kind: 'browser'。`);
}

export function createMcpDataReader(options: McpDataReaderOptions): DataReader {
  async function read<T = unknown>(request: DataRequest, _options?: DataCallOptions): Promise<DataResult<T>> {
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
    async request<T = unknown>(
      _recipe: RequestRecipe,
      _overrides?: CallOverrides,
      _options?: DataCallOptions,
    ): Promise<DataResult<T>> {
      return unsupported('recipe');
    },
    async requestMany<T = unknown>(
      recipe: RequestRecipe,
      calls: RecipeCalls,
      _options?: DataCallOptions,
    ): Promise<RecipeResults<T>> {
      void recipe;
      const one = unsupported('requestMany');
      return Object.fromEntries(Object.keys(calls).map((name) => [name, one])) as RecipeResults<T>;
    },
    async submit<T = unknown>(
      _recipe: RequestRecipe,
      _overrides?: CallOverrides,
      _options?: DataCallOptions,
    ): Promise<DataResult<T>> {
      return unsupported('submit');
    },
    async submitPlan(request: RequestPlan): Promise<PlanResults> {
      return allSame(request, unsupported('submitPlan').error);
    },
    async plan(request: RequestPlan, _options?: DataCallOptions): Promise<PlanResults> {
      if (request.steps.some((step) => step.response?.saveAs !== undefined)) {
        return allSame(request, {
          code: 'invalid-request',
          message: '这套适配器不支持保存附件：saveAs 只适用于默认集合',
        });
      }
      const failed = (error: unknown): PlanResults => {
        const one = failure(error instanceof Error ? error.message : String(error));
        return Object.fromEntries(request.steps.map((step) => [step.name, one]));
      };
      let script: string;
      try {
        script = scriptOfPlan(request);
      } catch (error) {
        return failed(error);
      }
      try {
        await options.call('browser_navigate', { url: request.origin });
        const value = await options.call('browser_evaluate', { script });
        return planResultsOf(value, request.steps.map((one) => one.name), {
          ...(request.loginUrl === undefined ? {} : { loginUrl: request.loginUrl }),
        });
      } catch (error) {
        return failed(error);
      }
    },
  };
}
