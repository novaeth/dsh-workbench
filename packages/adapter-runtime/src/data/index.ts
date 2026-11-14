import {
  callsProblemOf,
  noWrite,
  now,
  planProblemOf,
  planResultsOf,
  recipeProblemOf,
  scriptOf,
  scriptOfMany,
  scriptOfPlan,
  allSame,
  type Seam,
} from '@dsh-workbench/shared/host';
import type {
  CallOverrides,
  DataCallOptions,
  DataError,
  DataFailure,
  DataReader,
  DataRequest,
  DataResult,
  PlanStepResult,
  RecipeCalls,
  RecipeResults,
  RequestPlan,
  PlanResults,
  RequestRecipe,
  SubmitPlanOptions,
} from '@dsh-workbench/shared/host';
import { browserRead, type BrowserReadResult } from '../browser/index.js';
import { attachOf } from './attachment.js';
import { readHttp } from './http.js';
import { createCommandRead } from './command-read.js';
import { createSessionQueue } from './queue.js';
import { submitPlanOf, type SubmitRun } from './submit-plan.js';
import { sessionOf, type DataReaderOptions } from './types.js';
import {
  allFailure,
  asRecord,
  browserFailure,
  failure,
  pageFailure,
  pickOf,
} from './result.js';
import {
  channelCallOf,
  channelCommandLine,
  ensureChannel,
  type ChannelCall,
  type ChannelState,
} from './channel.js';

export * from './channel-plugin.js';
export type { QueueWaitEvent } from './queue.js';
export type { DataReaderOptions, SaveBytes, SaveBytesInput } from './types.js';

const MAX_WIN32_ARGV = 24_000;

function scriptArgProblemOf(script: string): string | undefined {
  if (typeof process === 'undefined' || process.platform !== 'win32') return undefined;
  if (Math.ceil(Buffer.byteLength(script, 'utf8') / 3) * 4 <= MAX_WIN32_ARGV) return undefined;
  return '这份计划在 Windows 上太长（脚本超过命令行上限）：拆成几份计划，或把步骤写短一点';
}

export function createDataReader(options: DataReaderOptions = {}): DataReader {
  const fetchOf = options.fetch ?? globalThis.fetch;
  const command = options.command ?? 'opencli';
  const queue = createSessionQueue();
  const queueWaitMs = options.queueWaitMs ?? 30_000;
  const readCommand = createCommandRead({ seam: options.seam, command });

  type BrowserReadInput = Parameters<typeof browserRead>[0];

  function browserCall(input: {
    readonly seam: Seam;
    readonly script: string;
    readonly url?: string | undefined;
    readonly loginUrl?: string | undefined;
    readonly session: string;
    readonly open?: boolean | undefined;
    readonly timeoutMs?: number | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly retry?: boolean | undefined;
  }): BrowserReadInput {
    return {
      seam: input.seam,
      script: input.script,
      command,
      ...(input.url === undefined ? {} : { url: input.url }),
      ...(input.loginUrl === undefined || input.loginUrl === '' ? {} : { loginUrl: input.loginUrl }),
      session: input.session,
      ...(input.open === undefined ? {} : { open: input.open }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.retry === undefined ? {} : { retry: input.retry }),
    };
  }

  type Guarded<T> =
    | { readonly kind: 'done'; readonly value: T }
    | { readonly kind: 'failed'; readonly result: DataFailure };

  type UnwrappedBrowser = { readonly ok: true; readonly result: BrowserReadResult } | DataFailure;

  function unwrapBrowser(got: Guarded<BrowserReadResult>, loginUrl?: string): UnwrappedBrowser {
    if (got.kind === 'failed') return got.result;
    if (!got.value.ok) return browserFailure(got.value, loginUrl);
    return { ok: true, result: got.value };
  }

  function recipeBrowserInput(
    recipe: RequestRecipe,
    script: string,
    seam: Seam,
    callOptions: DataCallOptions,
  ): Parameters<typeof guardedBrowser>[0] {
    return {
      seam,
      script,
      url: recipe.origin,
      ...(recipe.loginUrl === undefined ? {} : { loginUrl: recipe.loginUrl }),
      ...(recipe.session === undefined ? {} : { session: recipe.session }),
      ...(callOptions.open === undefined ? {} : { open: callOptions.open }),
      ...(recipe.timeoutMs === undefined ? {} : { timeoutMs: recipe.timeoutMs }),
      ...(callOptions.signal === undefined ? {} : { signal: callOptions.signal }),
    };
  }

  async function guardedBrowser(input: {
    readonly seam: Seam;
    readonly script: string;
    readonly url?: string | undefined;
    readonly loginUrl?: string | undefined;
    readonly session?: string | undefined;
    readonly open?: boolean | undefined;
    readonly timeoutMs?: number | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly retry?: boolean | undefined;
  }): Promise<Guarded<BrowserReadResult>> {
    const argv = scriptArgProblemOf(input.script);
    if (argv !== undefined) return { kind: 'failed', result: failure('invalid-request', argv) };
    const session = sessionOf(input.session);
    return serialGuard(session, input.signal, () => browserRead(browserCall({ ...input, session })));
  }

  async function serialGuard<T>(
    session: string,
    signal: AbortSignal | undefined,
    work: () => Promise<T>,
  ): Promise<Guarded<T>> {
    const started = now();
    const outcome = await queue.acquire(session, signal, queueWaitMs);
    try {
      options.onQueue?.({ session, waitedMs: now() - started, outcome });
    } catch {
    }
    if (outcome === 'aborted') {
      return { kind: 'failed', result: failure('aborted', '已停止', { pageCode: 'aborted' }) };
    }
    if (outcome === 'timeout') {
      return {
        kind: 'failed',
        result: failure('timeout', '排队太久，没轮到这次读', { hint: '稍后重试' }),
      };
    }
    try {
      return { kind: 'done', value: await work() };
    } finally {
      queue.release(session);
    }
  }

  async function readBrowser(
    request: Extract<DataRequest, { kind: 'browser' }>,
    callOptions: DataCallOptions,
  ): Promise<DataResult<unknown>> {
    if (options.seam === undefined) return failure('invalid-request', '没有执行缝，读不了浏览器');
    const open = callOptions.open ?? request.open;
    const got = await guardedBrowser({
      seam: options.seam as Seam,
      script: request.script,
      ...(request.url === undefined ? {} : { url: request.url }),
      ...(request.loginUrl === undefined ? {} : { loginUrl: request.loginUrl }),
      ...(request.session === undefined ? {} : { session: request.session }),
      ...(open === undefined ? {} : { open }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(callOptions.signal === undefined ? {} : { signal: callOptions.signal }),
    });
    const unwrapped = unwrapBrowser(got, request.loginUrl);
    if (!unwrapped.ok) return unwrapped;
    return { ok: true, data: unwrapped.result.value };
  }

  const channelState: { value: ChannelState } = { value: 'unknown' };

  async function readChannel(
    seam: Seam,
    call: ChannelCall,
    recipe: RequestRecipe,
    signal: AbortSignal | undefined,
  ): Promise<DataResult<unknown> | undefined> {
    const result = await seam
      .run({
        command: channelCommandLine(call),
        intent: noWrite(),
        retry: recipe.request.method === 'GET' ? 'safe' : 'never',
        timeoutMs: call.timeoutMs + 5000,
        bestEffort: true,
        ...(signal === undefined ? {} : { signal }),
      })
      .catch(() => undefined);
    if (result === undefined) return undefined;
    if (result.aborted) return failure('aborted', '已停止', { pageCode: 'aborted' });
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
    callOptions: DataCallOptions,
  ): Promise<DataResult<unknown>> {
    const problem = recipeProblemOf(recipe, overrides);
    if (problem !== undefined) return failure('invalid-request', problem);
    if (mode === 'request' && recipe.request.method !== 'GET') {
      return failure('invalid-request', 'request 只读 GET；写走 submit');
    }
    if (options.seam === undefined) return failure('invalid-request', '没有执行缝，读不了浏览器');
    const seam = options.seam;
    const call = options.channel === false ? undefined : channelCallOf(recipe, overrides ?? {}, command);
    if (call !== undefined && (await ensureChannel(seam, command, channelState, options.channelInstalled))) {
      const viaChannel = await readChannel(seam, call, recipe, callOptions.signal);
      if (viaChannel !== undefined) return viaChannel;
      channelState.value = 'unavailable';
    }
    let script: string;
    try {
      script = scriptOf(recipe, overrides);
    } catch (error) {
      return failure('invalid-request', error instanceof Error ? error.message : String(error));
    }
    const got = await guardedBrowser(recipeBrowserInput(recipe, script, seam, callOptions));
    const unwrapped = unwrapBrowser(got, recipe.loginUrl);
    if (!unwrapped.ok) return unwrapped;
    const result = unwrapped.result;
    const box = asRecord(result.value);
    if (box !== undefined && box['ok'] === true) {
      if ('data' in box) return { ok: true, data: box['data'] };
      if ('text' in box) return { ok: true, data: box['text'] };
    }
    return failure('parse', '页面脚本没有回 data / text', {
      detail: JSON.stringify(result.value).slice(0, 2000),
    });
  }

  async function readMany(
    recipe: RequestRecipe,
    calls: RecipeCalls,
    callOptions: DataCallOptions,
  ): Promise<RecipeResults> {
    const names = Object.keys(calls);
    const problem = callsProblemOf(recipe, calls);
    if (problem !== undefined) return allFailure(names, 'invalid-request', problem);
    if (recipe.request.method !== 'GET') {
      return allFailure(names, 'invalid-request', 'requestMany 只读 GET；写走 submit');
    }
    if (options.seam === undefined) return allFailure(names, 'invalid-request', '没有执行缝，读不了浏览器');
    const seam = options.seam;
    let script: string;
    try {
      script = scriptOfMany(recipe, calls);
    } catch (error) {
      return allFailure(names, 'invalid-request', error instanceof Error ? error.message : String(error));
    }
    const got = await guardedBrowser(recipeBrowserInput(recipe, script, seam, callOptions));
    if (got.kind === 'failed') return allFailure(names, got.result.error.code, got.result.error.message, got.result.error);
    const result = got.value;
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

  return {
    async read<T = unknown>(request: DataRequest, callOptions: DataCallOptions = {}): Promise<DataResult<T>> {
      if (request.kind === 'http') return (await readHttp(request, callOptions, fetchOf)) as DataResult<T>;
      if (request.kind === 'browser') return (await readBrowser(request, callOptions)) as DataResult<T>;
      if (request.kind === 'command') return (await readCommand(request, callOptions)) as DataResult<T>;
      return failure('invalid-request', '不认识的读类型') as DataResult<T>;
    },
    async request<T = unknown>(
      recipe: RequestRecipe,
      overrides?: CallOverrides,
      callOptions: DataCallOptions = {},
    ): Promise<DataResult<T>> {
      return (await readRecipe(recipe, overrides, 'request', callOptions)) as DataResult<T>;
    },
    async requestMany<T = unknown>(
      recipe: RequestRecipe,
      calls: RecipeCalls,
      callOptions: DataCallOptions = {},
    ): Promise<RecipeResults<T>> {
      return (await readMany(recipe, calls, callOptions)) as RecipeResults<T>;
    },
    async plan(plan: RequestPlan, callOptions: DataCallOptions = {}): Promise<PlanResults> {
      if (options.seam === undefined) {
        return allSame(plan, { code: 'invalid-request', message: '没有执行缝，读不了浏览器' });
      }
      const problem = planProblemOf(plan)[0];
      if (problem !== undefined) {
        return allSame(plan, { code: 'invalid-request', message: `${problem.path}: ${problem.problem}` });
      }
      const session = sessionOf(plan.session);
      const names = plan.steps.map((one) => one.name);
      let script: string;
      try {
        script = scriptOfPlan(plan);
      } catch (error) {
        const wrong: DataError = {
          code: 'invalid-request',
          message: error instanceof Error ? error.message : String(error),
        };
        return allSame(plan, wrong);
      }
      const got = await guardedBrowser({
        seam: options.seam as Seam,
        script,
        url: plan.origin,
        ...(plan.loginUrl === undefined ? {} : { loginUrl: plan.loginUrl }),
        session,
        open: callOptions.open ?? false,
        ...(plan.timeoutMs === undefined ? {} : { timeoutMs: plan.timeoutMs }),
        ...(callOptions.signal === undefined ? {} : { signal: callOptions.signal }),
      });
      if (got.kind === 'failed') return allSame(plan, got.result.error);
      const result = got.value;
      if (!result.ok) return allSame(plan, browserFailure(result, plan.loginUrl).error);
      const outcome = planResultsOf(result.value, names, {
        ...(plan.loginUrl === undefined ? {} : { loginUrl: plan.loginUrl }),
      });
      const final: Record<string, PlanStepResult<unknown>> = { ...outcome };
      for (const step of plan.steps) {
        if (step.response?.saveAs !== 'attachment') continue;
        const one = outcome[step.name];
        if (one !== undefined) final[step.name] = await attachOf(step, one, options.saveBytes);
      }
      return final;
    },
    async submitPlan(plan: RequestPlan, submitOptions: SubmitPlanOptions): Promise<PlanResults> {
      if (options.seam === undefined) {
        return allSame(plan, { code: 'invalid-request', message: '没有执行缝，写不了' });
      }
      const run: SubmitRun = async (script) => {
        const got = await guardedBrowser({
          seam: options.seam as Seam,
          script,
          url: plan.origin,
          ...(plan.loginUrl === undefined ? {} : { loginUrl: plan.loginUrl }),
          ...(plan.session === undefined ? {} : { session: plan.session }),
          open: submitOptions.open ?? false,
          ...(plan.timeoutMs === undefined ? {} : { timeoutMs: plan.timeoutMs }),
          ...(submitOptions.signal === undefined ? {} : { signal: submitOptions.signal }),
          retry: false,
        });
        if (got.kind === 'failed') return got.result;
        if (!got.value.ok) return browserFailure(got.value, plan.loginUrl);
        return { ok: true, value: got.value.value };
      };
      return submitPlanOf(plan, submitOptions, run, options.saveBytes);
    },
    async submit<T = unknown>(
      recipe: RequestRecipe,
      overrides?: CallOverrides,
      callOptions: DataCallOptions = {},
    ): Promise<DataResult<T>> {
      return (await readRecipe(recipe, overrides, 'submit', callOptions)) as DataResult<T>;
    },
  };
}
