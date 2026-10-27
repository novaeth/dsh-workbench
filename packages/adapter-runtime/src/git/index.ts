import type { DshShell } from '@dsh-workbench/shared';
import type { BranchRead, GitReader, HeadRead, OriginRead } from '@dsh-workbench/shared';
import { quoteShellArg, runShell, tailLines } from '@dsh-workbench/shared/host';

export interface GitReaderOptions {
  readonly shell: DshShell;
  readonly logger?: { warn?(message: string): void } | undefined;
}

function keyOf(path: string): string {
  return String(path ?? '').trim();
}

export function createGitReader(options: GitReaderOptions): GitReader {
  const { shell, logger } = options;

  return {
    async origin(path: string): Promise<OriginRead> {
      const key = keyOf(path);
      if (!key) return { kind: 'unknown', reason: 'no-path' };
      let result;
      try {
        result = await runShell(shell, `git -C ${quoteShellArg(key)} remote get-url origin`);
      } catch (error) {
        logger?.warn?.(`[dsh-workbench] git remote 执行失败：${String(error)}`);
        return { kind: 'unknown', reason: 'exec-failed', detail: String(error) };
      }
      if (result.exitCode !== 0) return { kind: 'no-origin', detail: tailLines(result.stderr, 3) };
      return { kind: 'ok', remote: result.stdout.trim() };
    },

    async branch(path: string): Promise<BranchRead> {
      const key = keyOf(path);
      if (!key) return { kind: 'unknown', reason: 'no-path' };
      let result;
      try {
        result = await runShell(
          shell,
          `git -C ${quoteShellArg(key)} rev-parse --abbrev-ref HEAD`,
        );
      } catch (error) {
        logger?.warn?.(`[dsh-workbench] git rev-parse --abbrev-ref 执行失败：${String(error)}`);
        return { kind: 'unknown', reason: 'exec-failed', detail: String(error) };
      }
      const name = result.stdout.trim();
      if (result.exitCode !== 0) return { kind: 'no-branch', detail: tailLines(result.stderr, 3) };
      if (name === '' || name === 'HEAD') return { kind: 'no-branch', detail: name };
      return { kind: 'ok', branch: name };
    },

    async head(path: string): Promise<HeadRead> {
      const key = keyOf(path);
      if (!key) return { kind: 'unknown', reason: 'no-path' };
      let result;
      try {
        result = await runShell(shell, `git -C ${quoteShellArg(key)} rev-parse HEAD`);
      } catch (error) {
        logger?.warn?.(`[dsh-workbench] git rev-parse 执行失败：${String(error)}`);
        return { kind: 'unknown', reason: 'exec-failed', detail: String(error) };
      }
      if (result.exitCode !== 0) return { kind: 'no-head', detail: tailLines(result.stderr, 3) };
      return { kind: 'ok', commit: result.stdout.trim() };
    },
  };
}
