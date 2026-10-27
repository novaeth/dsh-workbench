import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { gitProbeHandler } from '../git-routes';

function shellOf(exitCode: number | null, stderr = ''): { readonly shell: DshShell; readonly calls: string[] } {
  const calls: string[] = [];
  const shell = {
    resolve(spec: { command: string }) {
      calls.push(spec.command);
      return spec;
    },
    async execute() {
      return {
        result: async () => ({
          exitCode,
          timedOut: false,
          aborted: false,
          stdout: { text: '', truncated: false },
          stderr: { text: stderr, truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
  return { shell, calls };
}

function ctxOf(shell: DshShell | undefined): DshHostContext {
  return { get: (name: string) => (name === 'shell' ? shell : undefined) } as unknown as DshHostContext;
}

describe('装之前的体检接口', () => {
  it('缺 url 直接说缺，不去跑 git', async () => {
    const handler = gitProbeHandler(ctxOf(shellOf(0).shell));
    await expect(handler(new URLSearchParams())).resolves.toMatchObject({
      ok: false,
      error: { code: 'workbench/no-url' },
    });
  });

  it('没有执行缝就说没有，别假装探过', async () => {
    const handler = gitProbeHandler(ctxOf(undefined));
    await expect(handler(new URLSearchParams({ url: 'ssh://git@h/a/b.git' }))).resolves.toMatchObject({
      ok: false,
      error: { code: 'workbench/no-shell' },
    });
  });

  it('拿得到 shell 就把结论摊平回给界面', async () => {
    const fake = shellOf(128, "fatal: could not read Username for 'https://h': terminal prompts disabled\n");
    const handler = gitProbeHandler(ctxOf(fake.shell));
    const outcome = (await handler(new URLSearchParams({ url: 'https://h/a/b.git' }))) as {
      ok: boolean;
      status?: string;
      detail?: string;
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe('auth');
    expect(outcome.detail).toContain('terminal prompts disabled');
    expect(fake.calls[0]).toContain('ls-remote');
  });
});
