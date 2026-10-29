import { describe, expect, it } from 'vitest';
import { GIT_TIMEOUT_MS } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { runShell } from '@dsh-workbench/shared/host';

describe('runShell', () => {
  it('把命令行与选项交给 shell.resolve 补全', async () => {
    const fake = createFakeShell([{ stdout: 'ok' }]);
    await runShell(fake.shell, 'git -C /tmp status', { workdir: '/tmp', timeoutMs: 1234 });

    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(call?.command).toBe('git -C /tmp status');
    expect(call?.workdir).toBe('/tmp');
    expect(call?.timeoutMs).toBe(1234);
    expect(call?.onExpiry).toBe('kill');
    expect(call?.stdoutMaxBytes).toBeGreaterThan(0);
  });

  it('不传 timeoutMs 时用本地命令的默认超时', async () => {
    const fake = createFakeShell([{ stdout: 'ok' }]);
    await runShell(fake.shell, 'git status');
    expect(fake.calls[0]?.timeoutMs).toBe(GIT_TIMEOUT_MS);
    expect(fake.calls[0]?.workdir).toBeUndefined();
  });

  it('归一化结果：退出码、两个流、超时标记', async () => {
    const fake = createFakeShell([
      { stdout: 'out\n', stderr: 'err\n', exitCode: 3, timedOut: true },
    ]);
    const result = await runShell(fake.shell, 'cmd');
    expect(result).toEqual({
      exitCode: 3,
      timedOut: true,
      aborted: false,
      stdout: 'out\n',
      stderr: 'err\n',
      truncated: false,
    });
  });

  it('非零退出码**不抛错**：是不是错误由调用方判定', async () => {
    const fake = createFakeShell([{ exitCode: 128, stderr: 'fatal' }]);
    await expect(runShell(fake.shell, 'cmd')).resolves.toMatchObject({ exitCode: 128 });
  });

  it('执行缝自己故障时向上抛（调用方转成 demo-exec-failed）', async () => {
    const fake = createFakeShell([{ failWith: new Error('spawn ENOENT') }]);
    await expect(runShell(fake.shell, 'cmd')).rejects.toThrow('spawn ENOENT');
  });
});
