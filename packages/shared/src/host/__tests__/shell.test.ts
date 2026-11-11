import { describe, expect, it, vi } from 'vitest';
import type { DshShell, DshShellExecution } from '../../api/dsh.js';
import { runShell } from '../shell.js';

function hangingShell(): DshShell {
  return {
    resolve: (request: Parameters<DshShell['resolve']>[0]) => request,
    execute: () => new Promise<DshShellExecution>(() => {}),
  } as unknown as DshShell;
}

function replyingShell(exitCode: number, timedOut = false): DshShell {
  return {
    resolve: (request: Parameters<DshShell['resolve']>[0]) => request,
    execute: async () => ({
      result: async () => ({
        exitCode,
        timedOut,
        aborted: false,
        stdout: { text: 'v24.21.0\n', truncated: false },
        stderr: { text: '', truncated: false },
      }),
    }),
  } as unknown as DshShell;
}

function sandboxedShell(): DshShell {
  return {
    resolve: (request: Parameters<DshShell['resolve']>[0]) => request,
    execute: async () => ({
      result: async () => ({
        exitCode: 3_221_225_794,
        timedOut: false,
        aborted: false,
        stdout: { text: '', truncated: false },
        stderr: { text: 'windows-acl-run: token setup failed\n', truncated: false },
        sandbox: { mode: 'workspace-write', denied: false, runnerFailed: true },
      }),
    }),
  } as unknown as DshShell;
}

describe('runShell', () => {
  it('★ 沙箱事实原样带回来：runnerFailed 不当成"命令自己退出"', async () => {
    const result = await runShell(sandboxedShell(), 'echo hi');

    expect(result.exitCode).toBe(3_221_225_794);
    expect(result.sandbox?.runnerFailed).toBe(true);
    expect(result.stderr).toContain('windows-acl-run');
  });

  it('★ 宿主一直不交结果 → 到点自己收尾，不把调用方挂住', async () => {
    vi.useFakeTimers();
    try {
      const pending = runShell(hangingShell(), 'node --version', { timeoutMs: 10_000 });
      await vi.advanceTimersByTimeAsync(11_000);
      const result = await pending;

      expect(result.stalled).toBe(true);
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBeNull();
      expect(result.stdout).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 宿主准时交结果 → stalled=false，退出码与输出原样', async () => {
    const result = await runShell(replyingShell(0), 'node --version');

    expect(result.stalled).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('v24.21.0\n');
  });

  it('★ 宿主自己报超时 → timedOut=true，但不算 stalled', async () => {
    const result = await runShell(replyingShell(0, true), 'node --version');

    expect(result.timedOut).toBe(true);
    expect(result.stalled).toBe(false);
  });

  it('★ env 走 resolve 的覆盖字段，不拼进命令行的 shell 语法', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const shell = {
      resolve: (request: Parameters<DshShell['resolve']>[0]) => {
        seen.push(request as unknown as Record<string, unknown>);
        return request;
      },
      execute: async () => ({
        result: async () => ({
          exitCode: 0,
          timedOut: false,
          aborted: false,
          stdout: { text: '', truncated: false },
          stderr: { text: '', truncated: false },
        }),
      }),
    } as unknown as DshShell;

    await runShell(shell, 'node --version', { env: { OPENCLI_WINDOW: 'background' } });

    expect(seen[0]?.command).toBe('node --version');
    expect(seen[0]?.env).toEqual({ OPENCLI_WINDOW: 'background' });
  });

  it('★ 宿主自己抛错 → 照旧抛出去，不吞成 stalled', async () => {
    const shell = {
      resolve: (request: Parameters<DshShell['resolve']>[0]) => request,
      execute: async () => {
        throw new Error('spawn /bin/sh ENOENT');
      },
    } as unknown as DshShell;

    await expect(runShell(shell, 'node --version')).rejects.toThrow('ENOENT');
  });
});
