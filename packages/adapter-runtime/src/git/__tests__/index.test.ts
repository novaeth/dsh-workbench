import { describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createGitReader } from '../index.js';

describe('createGitReader', () => {
  it('origin / branch / head 读 shell 的 stdout', async () => {
    const fake = createFakeShell([
      { stdout: 'git@example.com:a/b/c.git\n' },
      { stdout: 'develop\n' },
      { stdout: 'abc123\n' },
    ]);
    const git = createGitReader({ shell: fake.shell });
    await expect(git.origin('/w/x')).resolves.toEqual({
      kind: 'ok',
      remote: 'git@example.com:a/b/c.git',
    });
    await expect(git.branch('/w/x')).resolves.toEqual({
      kind: 'ok',
      branch: 'develop',
    });
    await expect(git.head('/w/x')).resolves.toEqual({
      kind: 'ok',
      commit: 'abc123',
    });
    expect(fake.commands()).toEqual([
      "git -C '/w/x' remote get-url origin",
      "git -C '/w/x' rev-parse --abbrev-ref HEAD",
      "git -C '/w/x' rev-parse HEAD",
    ]);
  });

  it('非零退出给 no-origin / no-branch / no-head', async () => {
    const fake = createFakeShell([
      { exitCode: 2, stderr: 'fatal: no origin' },
      { exitCode: 2, stderr: 'fatal: no branch' },
      { exitCode: 2, stderr: 'fatal: no head' },
    ]);
    const git = createGitReader({ shell: fake.shell });
    await expect(git.origin('/w/x')).resolves.toMatchObject({
      kind: 'no-origin',
      detail: expect.stringContaining('no origin'),
    });
    await expect(git.branch('/w/x')).resolves.toMatchObject({
      kind: 'no-branch',
    });
    await expect(git.head('/w/x')).resolves.toMatchObject({ kind: 'no-head' });
  });

  it('执行故障给 unknown/exec-failed 并 warn', async () => {
    const warn = vi.fn();
    const fake = createFakeShell([{ failWith: new Error('boom') }]);
    const git = createGitReader({ shell: fake.shell, logger: { warn } });
    await expect(git.origin('/w/x')).resolves.toMatchObject({
      kind: 'unknown',
      reason: 'exec-failed',
    });
    expect(warn).toHaveBeenCalled();
  });
});
