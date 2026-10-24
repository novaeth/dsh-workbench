import type { DshShell } from '../api/dsh.js';
import { quoteShellArg, tailLines } from '../host/shell-text.js';
import { runShell } from '../host/shell.js';

export type OriginRead =
  | { readonly kind: 'ok'; readonly remote: string }
  | { readonly kind: 'no-origin'; readonly detail?: string }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string };

export type OriginReader = (path: string) => Promise<OriginRead>;

export type BranchRead =
  | { readonly kind: 'ok'; readonly branch: string }
  | { readonly kind: 'no-branch'; readonly detail?: string | undefined }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string | undefined };

export type BranchReader = (path: string) => Promise<BranchRead>;

export type HeadRead =
  | { readonly kind: 'ok'; readonly commit: string }
  | { readonly kind: 'no-head'; readonly detail?: string }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string };

export type HeadReader = (path: string) => Promise<HeadRead>;

export function createHeadReader(options: {
  shell: DshShell;
  logger?: { warn?(message: string): void } | undefined;
}): HeadReader {
  const { shell, logger } = options;

  return async function readHead(path: string): Promise<HeadRead> {
    const key = String(path ?? '').trim();
    if (!key) return { kind: 'unknown', reason: 'no-path' };

    let result;
    try {
      result = await runShell(shell, `git -C ${quoteShellArg(key)} rev-parse HEAD`);
    } catch (error) {
      logger?.warn?.(`[dsh-workbench] git rev-parse 执行失败：${String(error)}`);
      return { kind: 'unknown', reason: 'exec-failed', detail: String(error) };
    }

    if (result.exitCode !== 0) {
      return { kind: 'no-head', detail: tailLines(result.stderr, 3) };
    }
    return { kind: 'ok', commit: result.stdout.trim() };
  };
}

export function createBranchReader(options: {
  shell: DshShell;
  logger?: { warn?(message: string): void } | undefined;
}): BranchReader {
  const { shell, logger } = options;

  return async function readBranch(path: string): Promise<BranchRead> {
    const key = String(path ?? '').trim();
    if (!key) return { kind: 'unknown', reason: 'no-path' };

    let result;
    try {
      result = await runShell(shell, `git -C ${quoteShellArg(key)} rev-parse --abbrev-ref HEAD`);
    } catch (error) {
      logger?.warn?.(`[dsh-workbench] git rev-parse --abbrev-ref 执行失败：${String(error)}`);
      return { kind: 'unknown', reason: 'exec-failed', detail: String(error) };
    }

    const name = result.stdout.trim();
    if (result.exitCode !== 0) return { kind: 'no-branch', detail: tailLines(result.stderr, 3) };
    if (name === '' || name === 'HEAD') return { kind: 'no-branch', detail: name };
    return { kind: 'ok', branch: name };
  };
}

export function createOriginReader(options: {
  shell: DshShell;
  logger?: { warn?(message: string): void } | undefined;
}): OriginReader {
  const { shell, logger } = options;

  return async function readOrigin(path: string): Promise<OriginRead> {
    const key = String(path ?? '').trim();
    if (!key) return { kind: 'unknown', reason: 'no-path' };

    let result;
    try {
      result = await runShell(shell, `git -C ${quoteShellArg(key)} remote get-url origin`);
    } catch (error) {
      logger?.warn?.(`[dsh-workbench] git remote 执行失败：${String(error)}`);
      return { kind: 'unknown', reason: 'exec-failed', detail: String(error) };
    }

    if (result.exitCode !== 0) {
      return { kind: 'no-origin', detail: tailLines(result.stderr, 3) };
    }
    return { kind: 'ok', remote: result.stdout.trim() };
  };
}
