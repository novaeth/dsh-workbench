import type { Seam } from '@dsh-workbench/shared/host';
import { gitNoPromptProcessEnv } from './git-exec.js';

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

let gitSeam: Seam | undefined;

function promptlessEnv(): Readonly<Record<string, string>> {
  return gitNoPromptProcessEnv();
}

export function provideGitProcessSeam(seam: Seam | undefined): void {
  gitSeam = seam;
}

export function createGitRunner(seam: Seam): GitRunner {
  return async (args, options = {}) => {
    const outcome = await seam.run({
      argv: ['git', ...args],
      intent: { kind: 'host' },
      env: promptlessEnv(),
      ...(options.cwd === undefined ? {} : { workdir: options.cwd }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    return {
      exitCode: outcome.exitCode ?? null,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      timedOut: outcome.timedOut,
    };
  };
}

export const runGitProcess: GitRunner = async (args, options = {}) => {
  if (gitSeam === undefined) {
    throw new Error('git 命令还没接上执行缝（宿主域）—— 这个进程里没有可用的 shell 服务。');
  }
  return createGitRunner(gitSeam)(args, options);
};
