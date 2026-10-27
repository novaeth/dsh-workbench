import type { DshShell } from '@dsh-workbench/shared';
import { callsProblemOf, recipeProblemOf, runShell, scriptOf, scriptOfMany } from '@dsh-workbench/shared/host';
import type {
  CallOverrides,
  DataError,
  DataErrorCode,
  DataReader,
  DataRequest,
  DataResult,
  RecipeCalls,
  RecipeResults,
  RequestRecipe,
} from '@dsh-workbench/shared/host';
import { browserRead, type BrowserReadResult } from '../browser/index.js';
import { createOpencli } from '../cli/index.js';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';
import {
  channelCallOf,
  channelCommandLine,
  ensureChannel,
  type ChannelCall,
  type ChannelState,
} from './channel.js';

export interface DataReaderOptions {
  readonly shell?: DshShell | undefined;
  readonly command?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly channel?: boolean | undefined;
  readonly channelInstalled?: (() => boolean) | undefined;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function failure(code: DataErrorCode, message: string, extra: Partial<DataError> = {}): DataResult<never> {
  return { ok: false, error: { code, message, ...extra } };
}

function parse(text: string): DataResult<unknown> {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return failure('parse', '返回的不是 JSON', { detail: text.slice(0, 2000) });
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function dataCodeOf(pageCode: string): DataErrorCode {
  const code = pageCode.trim().toUpperCase().replace(/-/g, '_');
  if (
    code === 'NOT_LOGGED_IN' ||
    code === 'AUTH_FAILED' ||
    code === 'AUTH_REQUIRED' ||
    code === 'UNAUTHORIZED' ||
    code === 'UNAUTHENTICATED' ||
    code === 'PERMISSION_DENIED' ||
    code === 'FORBIDDEN' ||
    code.includes('UNAUTH')
  ) {
    return 'auth';
  }
  if (code === 'TIMEOUT' || code === 'CLI_TIMEOUT') return 'timeout';
  if (/^HTTP_\d{3}$/.test(code)) return 'http';
  if (code === 'PARSE' || code === 'SHAPE') return 'parse';
  return 'browser';
}

function statusOf(pageCode: string): number | undefined {
  const match = /^http-(\d{3})$/i.exec(pageCode.trim());
  return match === null ? undefined : Number(match[1]);
}

function browserFailure(result: BrowserReadResult, loginUrl?: string): DataResult<never> {
  const pageCode = result.pageCode ?? result.code;
  const mapped = dataCodeOf(result.code);
  const code = mapped === 'browser' ? dataCodeOf(pageCode) : mapped;
  const status = statusOf(result.code) ?? statusOf(pageCode);
  const helpUrl = result.helpUrl ?? (code === 'auth' ? loginUrl : undefined);
  return {
    ok: false,
    error: {
      code,
      message: result.message,
      ...(status === undefined ? {} : { status }),
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      ...(result.hint === undefined ? {} : { hint: result.hint }),
      ...(helpUrl === undefined ? {} : { helpUrl }),
      ...(pageCode === '' ? {} : { pageCode }),
    },
  };
}

function pageFailure(pageCode: string, message: string, loginUrl?: string): DataResult<never> {
  const code = dataCodeOf(pageCode);
  const status = statusOf(pageCode);
  const helpUrl = code === 'auth' ? loginUrl : undefined;
  return {
    ok: false,
    error: {
      code,
      message,
      ...(status === undefined ? {} : { status }),
      ...(helpUrl === undefined ? {} : { helpUrl }),
      ...(pageCode === '' ? {} : { pageCode }),
    },
  };
}

function pickOf(value: unknown, path: string): unknown {
  let at: unknown = value;
  for (const key of path.split('.')) {
    const box = asRecord(at);
    if (box === undefined) return undefined;
    at = box[key];
  }
  return at;
}

function allFailure(
  names: readonly string[],
  code: DataErrorCode,
  message: string,
  extra: Partial<DataError> = {},
): Record<string, DataResult<never>> {
  const out: Record<string, DataResult<never>> = {};
  for (const name of names) out[name] = { ok: false, error: { code, message, ...extra } };
  return out;
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
    if (!result.ok) return browserFailure(result, request.loginUrl);
    return { ok: true, data: result.value };
  }

  const channelState: { value: ChannelState } = { value: 'unknown' };

  async function readChannel(
    shell: DshShell,
    call: ChannelCall,
    recipe: RequestRecipe,
  ): Promise<DataResult<unknown> | undefined> {
    const result = await runShell(shell, channelCommandLine(call), { timeoutMs: call.timeoutMs + 5000 });
    if (result.timedOut) return failure('timeout', `通道读超时（${call.timeoutMs}ms）`);
    if (result.exitCode !== 0) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      return undefined;
    }
    const box = asRecord(parsed);
    if (box === undefined) return undefined;
    if (box['ok'] !== true) {
      const pageCode = typeof box['code'] === 'string' ? box['code'] : '';
      const message =
        typeof box['message'] === 'string' && box['message'] !== ''
          ? box['message']
          : `读不到（${pageCode === '' ? 'unknown' : pageCode}）`;
      return pageFailure(pageCode, message, recipe.loginUrl);
    }
    if (recipe.response?.kind === 'text') {
      return typeof box['text'] === 'string'
        ? { ok: true, data: box['text'] }
        : failure('parse', '通道没有回 text', { detail: JSON.stringify(parsed).slice(0, 2000) });
    }
    const path = recipe.response?.path;
    if (path === undefined) return { ok: true, data: box['data'] };
    const value = pickOf(box['data'], path);
    return value === undefined
      ? failure('parse', `返回里没有 ${path} 这一格`, { detail: JSON.stringify(parsed).slice(0, 2000) })
      : { ok: true, data: value };
  }

  async function readRecipe(
    recipe: RequestRecipe,
    overrides: CallOverrides | undefined,
    mode: 'request' | 'submit',
  ): Promise<DataResult<unknown>> {
    const problem = recipeProblemOf(recipe);
    if (problem !== undefined) return failure('invalid-request', problem);
    if (mode === 'request' && recipe.request.method !== 'GET') {
      return failure('invalid-request', 'request 只读 GET；写走 submit');
    }
    if (options.shell === undefined) return failure('invalid-request', '没有 shell，读不了浏览器');
    const call = options.channel === false ? undefined : channelCallOf(recipe, overrides ?? {}, command);
    if (
      call !== undefined &&
      (await ensureChannel(options.shell, command, channelState, options.channelInstalled))
    ) {
      const viaChannel = await readChannel(options.shell, call, recipe);
      if (viaChannel !== undefined) return viaChannel;
      channelState.value = 'unavailable';
    }
    let script: string;
    try {
      script = scriptOf(recipe, overrides);
    } catch (error) {
      return failure('invalid-request', error instanceof Error ? error.message : String(error));
    }
    const result = await browserRead({
      shell: options.shell,
      script,
      command,
      url: recipe.origin,
      ...(recipe.loginUrl === undefined ? {} : { loginUrl: recipe.loginUrl }),
      ...(recipe.session === undefined ? {} : { session: recipe.session }),
      ...(recipe.timeoutMs === undefined ? {} : { timeoutMs: recipe.timeoutMs }),
    });
    if (!result.ok) return browserFailure(result, recipe.loginUrl);
    const box = asRecord(result.value);
    if (box !== undefined && box['ok'] === true) {
      if ('data' in box) return { ok: true, data: box['data'] };
      if ('text' in box) return { ok: true, data: box['text'] };
    }
    return failure('parse', '页面脚本没有回 data / text', {
      detail: JSON.stringify(result.value).slice(0, 2000),
    });
  }

  async function readMany(recipe: RequestRecipe, calls: RecipeCalls): Promise<RecipeResults> {
    const names = Object.keys(calls);
    const problem = callsProblemOf(recipe, calls);
    if (problem !== undefined) return allFailure(names, 'invalid-request', problem);
    if (recipe.request.method !== 'GET') {
      return allFailure(names, 'invalid-request', 'requestMany 只读 GET；写走 submit');
    }
    if (options.shell === undefined) return allFailure(names, 'invalid-request', '没有 shell，读不了浏览器');
    let script: string;
    try {
      script = scriptOfMany(recipe, calls);
    } catch (error) {
      return allFailure(names, 'invalid-request', error instanceof Error ? error.message : String(error));
    }
    const result = await browserRead({
      shell: options.shell,
      script,
      command,
      url: recipe.origin,
      ...(recipe.loginUrl === undefined ? {} : { loginUrl: recipe.loginUrl }),
      ...(recipe.session === undefined ? {} : { session: recipe.session }),
      ...(recipe.timeoutMs === undefined ? {} : { timeoutMs: recipe.timeoutMs }),
    });
    if (!result.ok) {
      const one = browserFailure(result, recipe.loginUrl);
      const failed: Record<string, DataResult<unknown>> = {};
      for (const name of names) failed[name] = one;
      return failed;
    }
    const box = asRecord(result.value);
    const results = box === undefined ? undefined : asRecord(box['results']);
    if (box === undefined || box['ok'] !== true || results === undefined) {
      return allFailure(names, 'parse', '页面脚本没有回 results', {
        detail: JSON.stringify(result.value).slice(0, 2000),
      });
    }
    const out: Record<string, DataResult<unknown>> = {};
    for (const name of names) {
      const entry = asRecord(results[name]);
      if (entry === undefined) {
        out[name] = failure('parse', `页面脚本没有回 ${name} 这条`);
        continue;
      }
      if (entry['ok'] === true) {
        if ('data' in entry) out[name] = { ok: true, data: entry['data'] };
        else if ('text' in entry) out[name] = { ok: true, data: entry['text'] };
        else out[name] = failure('parse', `页面脚本 ${name} 这条没有 data / text`);
        continue;
      }
      const pageCode = typeof entry['code'] === 'string' ? entry['code'] : '';
      const message =
        typeof entry['message'] === 'string' && entry['message'] !== ''
          ? entry['message']
          : `读不到（${pageCode === '' ? 'unknown' : pageCode}）`;
      out[name] = pageFailure(pageCode, message, recipe.loginUrl);
    }
    return out;
  }

  const openclis = new Map<string, ReturnType<typeof createOpencli>>();

  function opencliOf(plugin: string, timeoutMs: number): ReturnType<typeof createOpencli> {
    const key = `${plugin}:${String(timeoutMs)}`;
    const cached = openclis.get(key);
    if (cached !== undefined) return cached;
    const created = createOpencli({
      shell: options.shell as DshShell,
      plugin,
      command,
      timeoutMs,
    });
    openclis.set(key, created);
    return created;
  }

  async function readCommand(request: Extract<DataRequest, { kind: 'command' }>): Promise<DataResult<unknown>> {
    if (options.shell === undefined) return failure('invalid-request', '没有 shell，跑不了命令');
    if (request.adapter !== 'opencli') {
      return failure('invalid-request', `不认识的命令适配器：${request.adapter}`);
    }
    const plugin = request.argv[0];
    if (plugin === undefined) return failure('invalid-request', '命令缺少 argv[0]（插件名）');
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const { value } = await opencliOf(plugin, timeoutMs).json(request.argv.slice(1));
      return { ok: true, data: value };
    } catch (error) {
      if (!(error instanceof WorkbenchDataError)) return failure('command', String(error));
      const code: DataErrorCode =
        error.code === 'auth-required' || error.code === 'permission-denied'
          ? 'auth'
          : error.code === 'cli-timeout'
            ? 'timeout'
            : error.code === 'cli-bad-output'
              ? 'parse'
              : 'command';
      return failure(code, error.message, {
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        ...(error.hint === undefined ? {} : { hint: error.hint }),
        ...(error.helpUrl === undefined ? {} : { helpUrl: error.helpUrl }),
        pageCode: error.code,
      });
    }
  }

  return {
    async read<T = unknown>(request: DataRequest): Promise<DataResult<T>> {
      if (request.kind === 'http') return (await readHttp(request)) as DataResult<T>;
      if (request.kind === 'browser') return (await readBrowser(request)) as DataResult<T>;
      if (request.kind === 'command') return (await readCommand(request)) as DataResult<T>;
      return failure('invalid-request', '不认识的读类型') as DataResult<T>;
    },
    async request<T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides): Promise<DataResult<T>> {
      return (await readRecipe(recipe, overrides, 'request')) as DataResult<T>;
    },
    async requestMany<T = unknown>(recipe: RequestRecipe, calls: RecipeCalls): Promise<RecipeResults<T>> {
      return (await readMany(recipe, calls)) as RecipeResults<T>;
    },
    async submit<T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides): Promise<DataResult<T>> {
      return (await readRecipe(recipe, overrides, 'submit')) as DataResult<T>;
    },
  };
}
