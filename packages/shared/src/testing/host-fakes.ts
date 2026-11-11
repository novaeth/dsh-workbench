import { setTimeout as delay } from 'node:timers/promises';
import type { DshShell } from '../api/dsh.js';
import type {
  ProcessChild,
  ProcessExitEvent,
  ProcessHost,
  ProcessSpawnOptions,
  ProcessStream,
} from '../host/seam/exec.js';

export interface ShellCall {
  command: string;
  workdir?: string;
  timeoutMs?: number;
  onExpiry?: string;
  stdoutMaxBytes?: number;
  env?: Readonly<Record<string, string>>;
  sandboxPolicy?: unknown;
}

export interface ShellReply {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  aborted?: boolean;
  truncated?: boolean;
  failWith?: Error;
  sandbox?: { mode?: string; denied?: boolean; enforcement?: string; runnerFailed?: boolean } | undefined;
}

const tick = (): Promise<void> => delay(0);

export function createFakeShell(replies: ShellReply[] | ((call: ShellCall, index: number) => ShellReply) = []) {
  const calls: ShellCall[] = [];
  let running = 0;
  let peak = 0;

  const replyAt = (index: number): ShellReply =>
    typeof replies === 'function' ? replies(calls[index] as ShellCall, index) : (replies[index] ?? {});

  const shell = {
    resolve(request: Parameters<DshShell['resolve']>[0]) {
      calls.push(request as ShellCall);
      return request;
    },
    async execute() {
      const index = calls.length - 1;
      const reply = replyAt(index);
      if (reply.failWith !== undefined) throw reply.failWith;

      running += 1;
      peak = Math.max(peak, running);

      return {
        async result() {
          await tick();
          running -= 1;
          return {
            exitCode: reply.exitCode ?? 0,
            timedOut: reply.timedOut ?? false,
            aborted: reply.aborted ?? false,
            stdout: { text: reply.stdout ?? '', truncated: reply.truncated === true },
            stderr: { text: reply.stderr ?? '', truncated: false },
            ...(reply.sandbox === undefined ? {} : { sandbox: reply.sandbox }),
          };
        },
      };
    },
  } as unknown as DshShell;

  return {
    shell,
    calls,
    peak: () => peak,
    commands: () => calls.map((call) => call.command),
  };
}


export function createFakeLogger() {
  const warnings: string[] = [];
  return {
    logger: {
      info: () => {},
      warn: (message: string) => {
        warnings.push(message);
      },
    },
    warnings,
  };
}

export interface FakeProcessReply {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly error?: Error;
  readonly hang?: boolean;
}

export interface FakeProcessChild extends ProcessChild {
  readonly writes: readonly string[];
  readonly killed: readonly string[];
  readonly unrefed: boolean;
  finish(code?: number | null, signal?: string | null): void;
  emitStdout(chunk: string): void;
  emitStderr(chunk: string): void;
  fail(error: Error): void;
}

export function createFakeProcesses(
  replies: FakeProcessReply[] | ((call: ProcessSpawnOptions, index: number) => FakeProcessReply) = [],
) {
  const calls: ProcessSpawnOptions[] = [];
  const children: FakeProcessChild[] = [];
  const host: ProcessHost = {
    spawn(options) {
      const index = calls.length;
      calls.push(options);
      const reply = typeof replies === 'function' ? replies(options, index) : (replies[index] ?? {});
      const outListeners: Array<(chunk: string) => void> = [];
      const errListeners: Array<(chunk: string) => void> = [];
      const exitListeners: Array<(event: ProcessExitEvent) => void> = [];
      const errorListeners: Array<(error: Error) => void> = [];
      const writes: string[] = [];
      const killed: string[] = [];
      let unrefed = false;
      let finished = false;
      const emitStdout = (chunk: string): void => {
        for (const listener of outListeners) listener(chunk);
      };
      const emitStderr = (chunk: string): void => {
        for (const listener of errListeners) listener(chunk);
      };
      const finish = (code: number | null = 0, signal: string | null = null): void => {
        if (finished) return;
        finished = true;
        for (const listener of exitListeners) listener({ code, signal });
      };
      const child: FakeProcessChild = {
        pid: 4242 + index,
        stdin: { write: (chunk: string) => writes.push(chunk) },
        stdout: streamOf(outListeners),
        stderr: streamOf(errListeners),
        writes,
        killed,
        get unrefed() {
          return unrefed;
        },
        finish,
        emitStdout,
        emitStderr,
        fail(error) {
          for (const listener of errorListeners) listener(error);
        },
        onExit(listener) {
          exitListeners.push(listener);
          return () => {
            const at = exitListeners.indexOf(listener);
            if (at >= 0) exitListeners.splice(at, 1);
          };
        },
        onError(listener) {
          errorListeners.push(listener);
          return () => {
            const at = errorListeners.indexOf(listener);
            if (at >= 0) errorListeners.splice(at, 1);
          };
        },
        unref() {
          unrefed = true;
        },
        kill(signal) {
          killed.push(signal ?? 'SIGTERM');
          queueMicrotask(() => finish(null, signal ?? 'SIGTERM'));
        },
      };
      children.push(child);
      if (reply.hang !== true) {
        queueMicrotask(() => {
          if (reply.error !== undefined) {
            child.fail(reply.error);
            return;
          }
          if (reply.stdout !== undefined) emitStdout(reply.stdout);
          if (reply.stderr !== undefined) emitStderr(reply.stderr);
          finish(reply.exitCode ?? 0, reply.signal ?? null);
        });
      }
      return child;
    },
  };
  return { host, calls, children };
}

function streamOf(listeners: Array<(chunk: string) => void>): ProcessStream {
  return {
    onData(listener) {
      listeners.push(listener);
      return () => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
  };
}
