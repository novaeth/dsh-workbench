import type { DshShell } from '../api/dsh.js';
import { GIT_TIMEOUT_MS } from '../config/constants.js';

export interface ShellResult {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export async function runShell(
  shell: DshShell,
  command: string,
  options: { workdir?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ShellResult> {
  const { workdir, timeoutMs = GIT_TIMEOUT_MS, signal } = options;

  const spec = shell.resolve({
    command,
    ...(workdir === undefined ? {} : { workdir }),
    timeoutMs,
    onExpiry: 'kill',
    stdoutMaxBytes: DEFAULT_MAX_BYTES,
    ...(signal === undefined ? {} : { signal }),
  });

  const execution = await shell.execute(spec);
  const result = await execution.result();

  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut === true,
    aborted: result.aborted === true,
    stdout: result.stdout.text,
    stderr: result.stderr.text,
    truncated: result.stdout.truncated || result.stderr.truncated,
  };
}
