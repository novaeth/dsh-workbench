import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { probeGitAddress, classifyGitProbe } from '../git-probe';

function shellOf(result: { exitCode: number | null; stderr?: string; stdout?: string; timedOut?: boolean }): {
  readonly shell: DshShell;
  readonly calls: string[];
} {
  const calls: string[] = [];
  const shell = {
    resolve(spec: { command: string }) {
      calls.push(spec.command);
      return spec;
    },
    async execute() {
      return {
        result: async () => ({
          exitCode: result.exitCode,
          timedOut: result.timedOut === true,
          aborted: false,
          stdout: { text: result.stdout ?? '', truncated: false },
          stderr: { text: result.stderr ?? '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
  return { shell, calls };
}

describe('装之前的 git 体检', () => {
  it('通了只回 ok，并且全程禁掉问人', async () => {
    const fake = shellOf({ exitCode: 0 });
    await expect(probeGitAddress(fake.shell, 'ssh://git@host/a/b.git')).resolves.toEqual({ status: 'ok' });
    const line = fake.calls[0] ?? '';
    expect(line).toContain('git');
    expect(line).toContain('ls-remote');
    expect(line).toContain('GIT_TERMINAL_PROMPT=0');
    expect(line).toContain('GIT_ASKPASS=');
  });

  it('缺凭据归成 auth，并留一句 stderr 给人看', async () => {
    const fake = shellOf({
      exitCode: 128,
      stderr: "fatal: could not read Username for 'https://host': terminal prompts disabled\n",
    });
    const outcome = await probeGitAddress(fake.shell, 'https://host/a/b.git');
    expect(outcome.status).toBe('auth');
    expect(outcome.detail).toContain('terminal prompts disabled');
  });

  it('连不上和要凭证分得开', async () => {
    const fake = shellOf({ exitCode: 128, stderr: 'ssh: Could not resolve hostname nope\n' });
    await expect(probeGitAddress(fake.shell, 'ssh://git@nope/a/b.git')).resolves.toMatchObject({
      status: 'unreachable',
    });
  });

  it('超时算连不上，别当能读', () => {
    expect(classifyGitProbe('', true)).toBe('unreachable');
    expect(classifyGitProbe('Permission denied (publickey).', false)).toBe('auth');
    expect(classifyGitProbe('Connection refused', false)).toBe('unreachable');
  });
});
