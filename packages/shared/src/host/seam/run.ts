import { now } from '../time.js';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DshShell } from '../../api/dsh.js';
import { workbenchRoot } from '../data-root.js';
import { shellKindOf } from '../shell-text.js';
import { callOperatorOf, invocationOf, quotedArgvLine, quotedLineOf } from '../shell-render.js';
import { runShell, type ShellResult } from '../shell.js';
import { deniedPathOf, sandboxDeniedOf } from './denial.js';
import { abortedResult, errorHookOf, killHookOf, killTreeOf } from './handles.js';
import { seamProductEnv } from './env.js';
import { definedEnvOf, hostEnvOf } from './host-env.js';
import type {
  ChannelHandle,
  ExecIntent,
  OpenRequest,
  ProcessChild,
  ProcessHost,
  SeamShellKind,
  SeamTarget,
  SpawnExit,
  SpawnHandle,
  SpawnRequest,
} from './exec.js';
import {
  SeamError,
  type DenialScope,
  type SeamDenial,
  type SeamFact,
  type SeamMode,
  type SeamPolicy,
  type WriteIntent,
} from './intent.js';
import { denialScopeOf, narrowerMode, pathsPolicy, policyOf, productPolicy, seamModeOf, workspacePolicy } from './policy.js';
import { createNodeProcessHost } from './process.js';

export interface SeamRequest {
  readonly command?: string | undefined;
  readonly argv?: readonly string[] | undefined;
  readonly shellKind?: SeamShellKind | undefined;
  readonly intent: ExecIntent;
  readonly session?: unknown;
  readonly workdir?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxBytes?: number | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly retry?: 'safe' | 'never' | undefined;
  readonly bestEffort?: true | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface SeamOutcome extends ShellResult {
  readonly denial?: SeamDenial | undefined;
}

export interface Seam {
  readonly runtimeRoot?: string | undefined;
  run(request: SeamRequest): Promise<SeamOutcome>;
  spawn(request: SpawnRequest): SpawnHandle;
  open(request: OpenRequest): ChannelHandle;
  facts(): readonly SeamFact[];
}

export interface SeamPorts {
  readonly shell: DshShell;
  readonly runtimeRoot?: string | undefined;
  readonly ceiling?: SeamMode | undefined;
  readonly grantOf?: ((session: unknown) => SeamPolicy | undefined) | undefined;
  readonly realHome?: string | undefined;
  readonly allowHost?: boolean | undefined;
  readonly processes?: ProcessHost | undefined;
  readonly factLimit?: number | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
}

const DENIAL_MARKER = /\[sandbox: file access denied under [a-z-]+ mode\]/i;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

function scopeText(scope: DenialScope): string {
  if (scope === 'product') return '工作台自己的目录';
  if (scope === 'workspace') return '会话工作区';
  if (scope === 'external') return '工作区之外的路径';
  return '没认出来的路径';
}

function denialMessageOf(scope: DenialScope, path: string | undefined, output: string): string {
  const where = path === undefined ? '' : `：${path}`;
  const marker = DENIAL_MARKER.test(output) ? '' : '（输出里没有沙箱标记，按拒绝处理）';
  const next =
    scope === 'external'
      ? '要写工作区外的路径得先让用户点头：把目标改到工作区，或让工具补上审批后再试'
      : '这是工作台自己的声明问题，不是用户的配置问题：把命令、域与路径一起记下来交给维护者';
  return `被沙箱挡住了（${scopeText(scope)}${where}）${marker}。${next}`;
}

function settle(result: ShellResult, denial?: SeamDenial): SeamOutcome {
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    aborted: result.aborted,
    stdout: result.stdout,
    stderr: result.stderr,
    truncated: result.truncated,
    stalled: result.stalled,
    ...(denial === undefined ? {} : { denial }),
  };
}

function targetOf(request: {
  readonly command?: string | undefined;
  readonly argv?: readonly string[] | undefined;
}): SeamTarget {
  const hasCommand = request.command !== undefined;
  const hasArgv = request.argv !== undefined;
  if (hasArgv && !hasCommand) {
    const argv = request.argv ?? [];
    if (argv.length === 0) throw new SeamError('scope-not-declared', 'argv 是空的：至少给一个可执行文件');
    return { argv };
  }
  if (hasCommand && !hasArgv) return { line: request.command ?? '' };
  throw new SeamError('scope-not-declared', '这条执行请求要么给 argv，要么给一条命令行，不能两个都给或都不给');
}

function displayOf(target: SeamTarget): string {
  return 'argv' in target ? quotedArgvLine(target.argv) : target.line;
}

function targetInvocationOf(target: SeamTarget, shellKind: SeamShellKind | undefined): { file: string; args: readonly string[] } {
  if ('argv' in target) {
    const [file, ...args] = target.argv;
    if (file === undefined) throw new SeamError('scope-not-declared', 'argv 是空的：至少给一个可执行文件');
    return { file, args };
  }
  return invocationOf(shellKind ?? shellKindOf(), target.line);
}

function sandboxedLineOf(target: SeamTarget, shellKind: SeamShellKind | undefined): string {
  const line = 'argv' in target ? quotedArgvLine(target.argv) : target.line;
  if (shellKind === undefined) return callOperatorOf(shellKindOf(), line);
  return callOperatorOf(shellKindOf(), quotedLineOf(invocationOf(shellKind, line)));
}

export function createSeam(ports: SeamPorts): Seam {
  const runtimeRoot = ports.runtimeRoot ?? workbenchRoot();
  const ceiling = ports.ceiling ?? seamModeOf(process.env['DSH_PERMISSION_MODE']);
  const allowHost = ports.allowHost === true;
  const processes = ports.processes ?? createNodeProcessHost();
  const limit = ports.factLimit ?? 80;
  const facts: SeamFact[] = [];

  function record(fact: SeamFact): void {
    facts.push(fact);
    if (facts.length > limit) facts.splice(0, facts.length - limit);
  }

  function grantFor(session: unknown): SeamPolicy | undefined {
    if (ports.grantOf === undefined || session === undefined || session === null) return undefined;
    try {
      return ports.grantOf(session);
    } catch {
      return undefined;
    }
  }

  function requireHost(intent: ExecIntent): void {
    if (intent.kind !== 'host') {
      throw new SeamError('scope-not-declared', '这条调用要走宿主进程执行，但写入域不是 host');
    }
    if (!allowHost) throw new SeamError('scope-not-declared', '宿主域只给宿主侧接线开出来；模块与普通调用点拿不到');
  }

  async function attempt(request: SeamRequest, policy: SeamPolicy, line: string): Promise<ShellResult> {
    return runShell(ports.shell, line, {
      ...(request.workdir === undefined ? {} : { workdir: request.workdir }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      env: { ...seamProductEnv({ runtimeRoot, realHome: ports.realHome }), ...definedEnvOf(request.env) },
      sandboxPolicy: policy,
    });
  }

  function healPolicyOf(intent: WriteIntent, scope: DenialScope, granted: SeamPolicy | undefined): SeamPolicy | undefined {
    if (scope === 'product' && intent.kind !== 'product') return productPolicy(ceiling, runtimeRoot);
    if (scope === 'workspace' && intent.kind === 'workspace') {
      if (granted === undefined) return undefined;
      try {
        return workspacePolicy(ceiling, granted);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  async function runHost(request: SeamRequest, target: SeamTarget): Promise<ShellResult> {
    const signal = request.signal;
    if (signal?.aborted === true) return abortedResult();
    const invocation = targetInvocationOf(target, request.shellKind);
    const child = processes.spawn({
      file: invocation.file,
      args: invocation.args,
      env: hostEnvOf(request.env),
      ...(request.workdir === undefined ? {} : { cwd: request.workdir }),
      detached: false,
      killTree: true,
      stdio: 'pipe',
      windowsHide: true,
    });
    const state = { stdout: '', stderr: '', truncated: false };
    const append = (which: 'stdout' | 'stderr', chunk: string): void => {
      const total = state.stdout.length + state.stderr.length;
      const room = (request.maxBytes ?? DEFAULT_MAX_BYTES) - total;
      if (room <= 0) {
        state.truncated = true;
        return;
      }
      const text = chunk.length > room ? chunk.slice(0, room) : chunk;
      state[which] += text;
      if (chunk.length > room) state.truncated = true;
    };
    child.stdout?.onData((chunk) => append('stdout', chunk));
    child.stderr?.onData((chunk) => append('stderr', chunk));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let stopping = false;
    const stopTree = (): void => {
      if (settled || stopping) return;
      stopping = true;
      killTreeOf(child, 'SIGKILL');
    };
    const onAbort = (): void => {
      if (settled) return;
      aborted = true;
      stopTree();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (request.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        stopTree();
      }, request.timeoutMs);
    }
    const exit = await new Promise<SpawnExit>((resolve) => {
      child.onExit((event) => {
        settled = true;
        resolve(event);
      });
      child.onError((error) => {
        settled = true;
        state.stderr = `${state.stderr}${String(error)}`;
        resolve({ code: null, signal: null });
      });
    });
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    return {
      exitCode: exit.code,
      timedOut,
      aborted,
      stdout: state.stdout,
      stderr: state.stderr,
      truncated: state.truncated,
      stalled: false,
    };
  }

  function spawnHost(request: SpawnRequest): SpawnHandle {
    const invocation = targetInvocationOf(request.target, undefined);
    const logFile =
      request.logFile ?? join(runtimeRoot, 'logs', `${request.label ?? 'spawn'}-${String(now())}.log`);
    mkdirSync(dirname(logFile), { recursive: true });
    const child = processes.spawn({
      file: invocation.file,
      args: invocation.args,
      env: hostEnvOf(request.env),
      ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
      detached: true,
      killTree: true,
      stdio: 'log',
      logFile,
      windowsHide: true,
    });
    child.unref();
    record({
      at: now(),
      verb: 'spawn',
      command: displayOf(request.target),
      intent: 'host',
      mode: 'host',
      workspaceRoot: '',
      exitCode: null,
      timedOut: false,
      stalled: false,
    });
    const display = displayOf(request.target);
    const errorListeners = new Set<(error: Error) => void>();
    const exitWaiters: Array<(event: SpawnExit) => void> = [];
    let settled: SpawnExit | undefined;
    let failure: Error | undefined;
    const settleExit = (event: SpawnExit): void => {
      if (settled !== undefined) return;
      settled = event;
      for (const waiter of exitWaiters.splice(0)) waiter(event);
    };
    child.onExit((event) => settleExit(event));
    child.onError((error) => {
      failure = error;
      settleExit({ code: null, signal: null });
      if (errorListeners.size === 0) {
        ports.logger?.warn?.(`[dsh-workbench] 起进程没跑起来（${display}）：${String(error)}`);
        return;
      }
      for (const listener of errorListeners) listener(error);
    });
    return {
      pid: child.pid,
      logFile,
      exit: () =>
        settled === undefined
          ? new Promise<SpawnExit>((resolve) => exitWaiters.push(resolve))
          : Promise.resolve(settled),
      onError: errorHookOf(() => failure, errorListeners),
      kill: killHookOf(child),
    };
  }

  function openHost(request: OpenRequest): ChannelHandle {
    const invocation = targetInvocationOf(request.target, undefined);
    const child: ProcessChild = processes.spawn({
      file: invocation.file,
      args: invocation.args,
      env: hostEnvOf(request.env),
      ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
      detached: false,
      killTree: true,
      stdio: 'pipe',
      windowsHide: true,
    });
    record({
      at: now(),
      verb: 'open',
      command: displayOf(request.target),
      intent: 'host',
      mode: 'host',
      workspaceRoot: '',
      exitCode: null,
      timedOut: false,
      stalled: false,
    });
    const display = displayOf(request.target);
    const errorListeners = new Set<(error: Error) => void>();
    const exitListeners = new Set<(event: SpawnExit) => void>();
    let failure: Error | undefined;
    let settled: SpawnExit | undefined;
    const settleExit = (event: SpawnExit): void => {
      if (settled !== undefined) return;
      settled = event;
      for (const listener of exitListeners) listener(event);
    };
    child.onExit((event) => settleExit(event));
    child.onError((error) => {
      failure = error;
      settleExit({ code: null, signal: null });
      if (errorListeners.size === 0) {
        ports.logger?.warn?.(`[dsh-workbench] 双向通道起不来（${display}）：${String(error)}`);
        return;
      }
      for (const listener of errorListeners) listener(error);
    });
    return {
      pid: child.pid,
      write: (chunk) => child.stdin?.write(chunk),
      onData(listener) {
        const offOut = child.stdout?.onData(listener) ?? (() => {});
        const offErr = child.stderr?.onData(listener) ?? (() => {});
        return () => {
          offOut();
          offErr();
        };
      },
      onExit(listener) {
        if (settled !== undefined) {
          listener(settled);
          return () => {};
        }
        exitListeners.add(listener);
        return () => exitListeners.delete(listener);
      },
      onError: errorHookOf(() => failure, errorListeners),
      kill: killHookOf(child),
    };
  }

  return {
    runtimeRoot,
    async run(request: SeamRequest): Promise<SeamOutcome> {
      const target = targetOf(request);
      if (request.intent.kind === 'host') {
        requireHost(request.intent);
        const started = now();
        const result = await runHost(request, target);
        record({
          at: started,
          verb: 'run',
          command: displayOf(target),
          intent: 'host',
          mode: 'host',
          workspaceRoot: '',
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          stalled: result.stalled,
        });
        return settle(result);
      }
      const granted = grantFor(request.session);
      const intent: WriteIntent = request.intent;
      const policy = policyOf(intent, ceiling, runtimeRoot, granted);
      const line = sandboxedLineOf(target, request.shellKind);
      let result = await attempt(request, policy, line);
      if (!sandboxDeniedOf(result.sandbox)) {
        record({
          at: now(),
          verb: 'run',
          command: line,
          intent: intent.kind,
          mode: policy.mode,
          workspaceRoot: policy.workspaceRoot,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          stalled: result.stalled,
        });
        return settle(result);
      }

      const path = deniedPathOf(result.stderr, result.stdout);
      const scope = denialScopeOf(path, policy, runtimeRoot, granted);
      const healedPolicy = request.retry === 'safe' ? healPolicyOf(intent, scope, granted) : undefined;
      let healed = false;
      if (healedPolicy !== undefined) {
        const retried = await attempt(request, healedPolicy, line).catch(() => undefined);
        if (retried !== undefined && !sandboxDeniedOf(retried.sandbox)) {
          result = retried;
          healed = true;
        }
      }
      const denial: SeamDenial = {
        ...(path === undefined ? {} : { path }),
        scope,
        ...(healed ? { healed: true } : {}),
      };
      record({
        at: now(),
        verb: 'run',
        command: line,
        intent: intent.kind,
        mode: policy.mode,
        workspaceRoot: policy.workspaceRoot,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stalled: result.stalled,
        denial,
      });
      if (healed) return settle(result, denial);
      if (request.bestEffort === true) {
        ports.logger?.warn?.(`[dsh-workbench] ${denialMessageOf(scope, path, `${result.stderr}\n${result.stdout}`)}`);
        return settle(result, denial);
      }
      throw new SeamError('sandbox-denied', denialMessageOf(scope, path, `${result.stderr}\n${result.stdout}`), {
        ...(path === undefined ? {} : { path }),
        scope,
      });
    },
    spawn(request: SpawnRequest): SpawnHandle {
      requireHost(request.intent);
      return spawnHost(request);
    },
    open(request: OpenRequest): ChannelHandle {
      requireHost(request.intent);
      return openHost(request);
    },
    facts: () => facts,
  };
}

export function sealedPolicyOf(policy: SeamPolicy, ceiling: SeamMode): SeamPolicy {
  return { mode: narrowerMode(ceiling, policy.mode), workspaceRoot: policy.workspaceRoot };
}

export { pathsPolicy, policyOf, productPolicy, workspacePolicy };
