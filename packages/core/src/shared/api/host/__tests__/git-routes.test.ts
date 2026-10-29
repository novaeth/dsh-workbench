import { describe, expect, it } from 'vitest';
import type { GitRunner } from '../git-process';
import { gitProbeHandler } from '../git-routes';

function gitOf(exitCode: number | null, stderr = ''): { readonly runGit: GitRunner; readonly calls: (readonly string[])[] } {
  const calls: (readonly string[])[] = [];
  const runGit: GitRunner = async (args) => {
    calls.push(args);
    return { exitCode, stdout: '', stderr, timedOut: false };
  };
  return { runGit, calls };
}

describe('装之前的体检接口', () => {
  it('缺 url 直接说缺，不去跑 git', async () => {
    const fake = gitOf(0);
    const handler = gitProbeHandler({ runGit: fake.runGit });
    await expect(handler(new URLSearchParams())).resolves.toMatchObject({
      ok: false,
      error: { code: 'workbench/no-url' },
    });
    expect(fake.calls).toEqual([]);
  });

  it('git 跑不起来也回一个结论，而不是假装没探过', async () => {
    const runGit: GitRunner = async () => {
      throw new Error('spawn git ENOENT');
    };
    const handler = gitProbeHandler({ runGit });
    const outcome = (await handler(new URLSearchParams({ url: 'ssh://git@h/a/b.git' }))) as {
      ok: boolean;
      status?: string;
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe('unreachable');
  });

  it('把结论摊平回给界面', async () => {
    const fake = gitOf(128, "fatal: could not read Username for 'https://h': terminal prompts disabled\n");
    const handler = gitProbeHandler({ runGit: fake.runGit });
    const outcome = (await handler(new URLSearchParams({ url: 'https://h/a/b.git' }))) as {
      ok: boolean;
      status?: string;
      detail?: string;
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe('auth');
    expect(outcome.detail).toContain('terminal prompts disabled');
    expect(fake.calls[0]).toEqual(['ls-remote', 'https://h/a/b.git', 'HEAD']);
  });
});
