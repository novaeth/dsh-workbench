import { execa } from 'execa';
import { GIT_NO_PROMPT_ENV } from './git-exec.js';

export interface GitRunResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface GitRunOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

export type GitRunner = (args: readonly string[], options?: GitRunOptions) => Promise<GitRunResult>;

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export const runGitProcess: GitRunner = async (args, options = {}) => {
  const result = await execa('git', [...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: { ...process.env, ...GIT_NO_PROMPT_ENV },
    stdin: 'ignore',
    reject: false,
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
    killSignal: 'SIGKILL',
    maxBuffer: options.maxBytes ?? DEFAULT_MAX_BYTES,
    stripFinalNewline: false,
  });
  return {
    exitCode: result.exitCode ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.timedOut === true,
  };
};
