import { describe, expect, it } from 'vitest';
import type { GitRunner } from '../git-process';
import { probeGitAddress, classifyGitProbe } from '../git-probe';

function gitOf(result: { exitCode: number | null; stderr?: string; stdout?: string; timedOut?: boolean }): {
  readonly runGit: GitRunner;
  readonly calls: (readonly string[])[];
} {
  const calls: (readonly string[])[] = [];
  const runGit: GitRunner = async (args) => {
    calls.push(args);
    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut === true,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  };
  return { runGit, calls };
}

describe('装之前的 git 体检', () => {
  it('通了只回 ok，参数里没有问人的口子', async () => {
    const fake = gitOf({ exitCode: 0 });
    await expect(probeGitAddress('ssh://git@host/a/b.git', { runGit: fake.runGit })).resolves.toEqual({
      status: 'ok',
    });
    expect(fake.calls[0]).toEqual(['ls-remote', 'ssh://git@host/a/b.git', 'HEAD']);
  });

  it('缺凭据归成 auth，并留一句 stderr 给人看', async () => {
    const fake = gitOf({
      exitCode: 128,
      stderr: "fatal: could not read Username for 'https://host': terminal prompts disabled\n",
    });
    const outcome = await probeGitAddress('https://host/a/b.git', { runGit: fake.runGit });
    expect(outcome.status).toBe('auth');
    expect(outcome.detail).toContain('terminal prompts disabled');
  });

  it('连不上和要凭证分得开', async () => {
    const fake = gitOf({ exitCode: 128, stderr: 'ssh: Could not resolve hostname nope\n' });
    await expect(probeGitAddress('ssh://git@nope/a/b.git', { runGit: fake.runGit })).resolves.toMatchObject({
      status: 'unreachable',
    });
  });

  it('git 跑不起来也算连不上，不抛给界面', async () => {
    const runGit: GitRunner = async () => {
      throw new Error('spawn git ENOENT');
    };
    await expect(probeGitAddress('https://host/a/b.git', { runGit })).resolves.toMatchObject({
      status: 'unreachable',
    });
  });

  it('超时算连不上，别当能读', () => {
    expect(classifyGitProbe('', true)).toBe('unreachable');
    expect(classifyGitProbe('Permission denied (publickey).', false)).toBe('auth');
    expect(classifyGitProbe('Connection refused', false)).toBe('unreachable');
  });
});
