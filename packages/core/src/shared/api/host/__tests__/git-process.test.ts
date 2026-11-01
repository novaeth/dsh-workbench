import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeam, type Seam } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';
import type { FakeProcessReply } from '@dsh-workbench/shared/testing';
import { createGitRunner, provideGitProcessSeam, runGitProcess } from '../git-process';

function seamWith(replies: readonly FakeProcessReply[]): {
  readonly seam: Seam;
  readonly calls: ReturnType<typeof createFakeProcesses>['calls'];
} {
  const processes = createFakeProcesses([...replies]);
  const seam = createSeam({
    shell: createFakeShell([{}]).shell,
    runtimeRoot: '/tmp/wb-seam-test',
    allowHost: true,
    processes: processes.host,
  });
  return { seam, calls: processes.calls };
}

afterEach(() => {
  provideGitProcessSeam(undefined);
  vi.useRealTimers();
});

describe('市场 git 一级命令：走执行缝的宿主域', () => {
  it('★ argv 直传 git，禁交互环境与 cwd / 超时都交出去', async () => {
    const { seam, calls } = seamWith([{ stdout: 'main\n' }]);

    const result = await createGitRunner(seam)(['branch', '--show-current'], {
      cwd: '/w/checkout',
      timeoutMs: 4_000,
    });

    expect(result).toEqual({ exitCode: 0, stdout: 'main\n', stderr: '', timedOut: false });
    const call = calls[0];
    expect(call?.file).toBe('git');
    expect(call?.args).toEqual(['branch', '--show-current']);
    expect(call?.cwd).toBe('/w/checkout');
    expect(call?.env['GIT_TERMINAL_PROMPT']).toBe('0');
    expect(call?.env['SSH_ASKPASS_REQUIRE']).toBe('never');
    expect(call?.env['GIT_ASKPASS']).toBe(process.platform === 'win32' ? undefined : '/usr/bin/false');
  });

  it('退出码 / 两路输出 / 超时标志原样映射回 GitRunResult', async () => {
    const { seam } = seamWith([{ exitCode: 128, stdout: 'out', stderr: 'fatal: nope\n' }]);

    await expect(createGitRunner(seam)(['ls-remote', 'https://h/a.git'])).resolves.toEqual({
      exitCode: 128,
      stdout: 'out',
      stderr: 'fatal: nope\n',
      timedOut: false,
    });
  });

  it('超时：杀子进程，回 timedOut 而不是挂住', async () => {
    vi.useFakeTimers();
    const { seam, calls } = seamWith([{ hang: true }]);

    const pending = createGitRunner(seam)(['fetch'], { timeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_001);
    const result = await pending;

    expect(result).toEqual({ exitCode: null, stdout: '', stderr: '', timedOut: true });
    expect(calls[0]?.file).toBe('git');
  });

  it('默认 runner 没接执行缝时直接说清，不自己起进程', async () => {
    await expect(runGitProcess(['status'])).rejects.toThrow(/执行缝/);
  });

  it('接上执行缝后默认 runner 走同一条路', async () => {
    const { seam, calls } = seamWith([{ stdout: 'ok' }]);
    provideGitProcessSeam(seam);

    await expect(runGitProcess(['status'])).resolves.toMatchObject({ exitCode: 0, stdout: 'ok' });
    expect(calls[0]?.args).toEqual(['status']);
  });
});
