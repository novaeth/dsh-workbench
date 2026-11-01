import { spawn } from 'node:child_process';
import type { DshShell } from '../api/dsh.js';
import { GIT_TIMEOUT_MS } from '../config/constants.js';

export interface ShellResult {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly stalled: boolean;
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const GUARD_SLACK_MS = 1_000;

function stalledResult(): ShellResult {
  return {
    exitCode: null,
    timedOut: true,
    aborted: false,
    stdout: '',
    stderr: '',
    truncated: false,
    stalled: true,
  };
}

async function settleWithin<T>(work: Promise<T>, limitMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), limitMs);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const SANDBOX_SPAWN_FAILURE = 3_221_225_794;

let warnedDirectFallback = false;

function sandboxKilledSpawn(exitCode: number | null): boolean {
  return exitCode === SANDBOX_SPAWN_FAILURE || exitCode === -1_073_741_502;
}

async function runDirect(
  command: string,
  options: {
    workdir?: string | undefined;
    timeoutMs: number;
    signal?: AbortSignal | undefined;
    env?: Readonly<Record<string, string>> | undefined;
  },
): Promise<ShellResult> {
  const platform = process.platform;
  const file = platform === 'win32' ? 'pwsh' : 'bash';
  const args = platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-lc', command];
  return await new Promise<ShellResult>((resolve) => {
    const child = spawn(file, args, {
      ...(options.workdir === undefined ? {} : { cwd: options.workdir }),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let done = false;
    const finish = (exitCode: number | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ exitCode, timedOut, aborted, stdout, stderr, truncated: false, stalled: false });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    const onAbort = (): void => {
      aborted = true;
      child.kill();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      stderr += String(error);
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

export async function runShell(
  shell: DshShell,
  command: string,
  options: {
    workdir?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    env?: Readonly<Record<string, string>>;
    sandbox?: { mode: 'read-only' | 'workspace-write' | 'danger-full-access'; workspaceRoot: string };
  } = {},
): Promise<ShellResult> {
  const { workdir, timeoutMs = GIT_TIMEOUT_MS, signal, env, sandbox } = options;

  const spec = shell.resolve({
    command,
    ...(workdir === undefined ? {} : { workdir }),
    timeoutMs,
    onExpiry: 'kill',
    stdoutMaxBytes: DEFAULT_MAX_BYTES,
    ...(signal === undefined ? {} : { signal }),
    ...(env === undefined ? {} : { env }),
    ...(sandbox === undefined ? {} : { sandboxPolicy: sandbox }),
  });

  const settled = await settleWithin(
    (async (): Promise<ShellResult> => {
      const execution = await shell.execute(spec);
      const result = await execution.result();
      return {
        exitCode: result.exitCode,
        timedOut: result.timedOut === true,
        aborted: result.aborted === true,
        stdout: result.stdout.text,
        stderr: result.stderr.text,
        truncated: result.stdout.truncated || result.stderr.truncated,
        stalled: false,
      };
    })(),
    timeoutMs + GUARD_SLACK_MS,
  );

  const first = settled ?? stalledResult();
  if (!sandboxKilledSpawn(first.exitCode)) return first;
  if (!warnedDirectFallback) {
    warnedDirectFallback = true;
    console.warn(
      `[dsh-workbench] 沙箱 shell 起不了子进程（0xC0000142：${command.slice(0, 80)}）——改直接 spawn，命令照跑`,
    );
  }
  return runDirect(command, { workdir, timeoutMs, signal, env });
}
