import { setTimeout as delay } from 'node:timers/promises';
import type { DshShell } from '../api/dsh.js';

export interface ShellCall {
  command: string;
  workdir?: string;
  timeoutMs?: number;
  onExpiry?: string;
  stdoutMaxBytes?: number;
}

export interface ShellReply {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  aborted?: boolean;
  failWith?: Error;
}

const tick = (): Promise<void> => delay(0);

export function createFakeShell(replies: ShellReply[] | ((call: ShellCall, index: number) => ShellReply) = []) {
  const calls: ShellCall[] = [];
  let running = 0;
  let peak = 0;

  const replyAt = (index: number): ShellReply =>
    typeof replies === 'function' ? replies(calls[index] as ShellCall, index) : (replies[index] ?? {});

  const shell: DshShell = {
    resolve(request) {
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
            stdout: { text: reply.stdout ?? '', truncated: false },
            stderr: { text: reply.stderr ?? '', truncated: false },
          };
        },
      };
    },
  };

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
