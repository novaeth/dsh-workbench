import type { DshShell } from '@dsh-workbench/shared';
import { browserRead } from '../browser/index.js';
import { runShell } from '@dsh-workbench/shared/host';
import type { DataError, DataReader, DataRequest, DataResult } from '@dsh-workbench/shared/host';

export interface DataReaderOptions {
  readonly shell?: DshShell | undefined;
  readonly command?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function failure(code: DataError['code'], message: string, extra: Partial<DataError> = {}): DataResult<never> {
  return { ok: false, error: { code, message, ...extra } };
}

function parse(text: string): DataResult<unknown> {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return failure('parse', '返回的不是 JSON', { detail: text.slice(0, 2000) });
  }
}

export function createDataReader(options: DataReaderOptions = {}): DataReader {
  const fetchOf = options.fetch ?? globalThis.fetch;
  const command = options.command ?? 'opencli';

  async function readHttp(request: Extract<DataRequest, { kind: 'http' }>): Promise<DataResult<unknown>> {
    if (fetchOf === undefined) return failure('invalid-request', '这个运行时没有 fetch');
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchOf(request.url, {
        method: 'GET',
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        return failure(response.status === 401 || response.status === 403 ? 'auth' : 'http', `HTTP ${response.status}`, {
          status: response.status,
          detail: text.slice(0, 2000),
        });
      }
      return parse(text);
    } catch (error) {
      if (controller.signal.aborted) return failure('timeout', `读超时（${timeoutMs}ms）`);
      return failure('http', error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  async function readBrowser(request: Extract<DataRequest, { kind: 'browser' }>): Promise<DataResult<unknown>> {
    if (options.shell === undefined) return failure('invalid-request', '没有 shell，读不了浏览器');
    const result = await browserRead({
      shell: options.shell,
      script: request.script,
      command,
      ...(request.url === undefined ? {} : { url: request.url }),
      ...(request.loginUrl === undefined ? {} : { loginUrl: request.loginUrl }),
      ...(request.session === undefined ? {} : { session: request.session }),
      ...(request.open === undefined ? {} : { open: request.open }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    });
    if (!result.ok) {
      return failure('browser', result.message, {
        detail: result.detail ?? result.code,
        ...(result.hint === undefined ? {} : { hint: result.hint }),
        ...(result.helpUrl === undefined ? {} : { helpUrl: result.helpUrl }),
      });
    }
    return { ok: true, data: result.value };
  }

  async function readCommand(request: Extract<DataRequest, { kind: 'command' }>): Promise<DataResult<unknown>> {
    if (options.shell === undefined) return failure('invalid-request', '没有 shell，跑不了命令');
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const result = await runShell(options.shell, request.command, { timeoutMs });
    if (result.timedOut) return failure('timeout', `命令超时（${timeoutMs}ms）`);
    if (result.exitCode !== 0) {
      return failure('command', `命令退出码 ${String(result.exitCode)}`, { detail: result.stderr.slice(0, 2000) });
    }
    return parse(result.stdout);
  }

  return {
    async read<T = unknown>(request: DataRequest): Promise<DataResult<T>> {
      if (request.kind === 'http') return (await readHttp(request)) as DataResult<T>;
      if (request.kind === 'browser') return (await readBrowser(request)) as DataResult<T>;
      if (request.kind === 'command') return (await readCommand(request)) as DataResult<T>;
      return failure('invalid-request', '不认识的读类型') as DataResult<T>;
    },
  };
}
