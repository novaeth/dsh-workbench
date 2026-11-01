import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeam } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';
import type { FakeProcessReply } from '@dsh-workbench/shared/testing';
import { profileCreateDepsOf, runSetupAt } from '../host-actions';

function seamWith(replies: readonly FakeProcessReply[]) {
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
  vi.useRealTimers();
});

describe('建 profile 的 setup 脚本：走执行缝的宿主域', () => {
  it('★ bash <bin> setup，cwd 与合并环境都交出去，成功时回 ok + 完整日志', async () => {
    const { seam, calls } = seamWith([{ exitCode: 0, stdout: '装好了\n', stderr: '一句提醒\n' }]);
    const previous = process.env.WB_SETUP_MARK;
    process.env.WB_SETUP_MARK = 'from-parent';
    try {
      const outcome = await runSetupAt(seam, '/pkg', { WB_SETUP_EXTRA: '1' });

      expect(outcome).toEqual({ ok: true, log: '装好了\n一句提醒\n' });
      const call = calls[0];
      expect(call?.file).toBe('bash');
      expect(call?.args).toEqual(['/pkg/bin/dsh-workbench', 'setup']);
      expect(call?.cwd).toBe('/pkg');
      expect(call?.env['WB_SETUP_EXTRA']).toBe('1');
      expect(call?.env['WB_SETUP_MARK']).toBe('from-parent');
      expect(call?.detached).toBe(false);
      expect(call?.windowsHide).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.WB_SETUP_MARK;
      else process.env.WB_SETUP_MARK = previous;
    }
  });

  it('非 0 退出 → ok false，但日志留给用户看', async () => {
    const { seam } = seamWith([{ exitCode: 3, stderr: 'npm 装不上\n' }]);

    await expect(runSetupAt(seam, '/pkg', {})).resolves.toEqual({ ok: false, log: 'npm 装不上\n' });
  });

  it('超时 → ok false 并写明创建超时', async () => {
    vi.useFakeTimers();
    const { seam } = seamWith([{ hang: true }]);

    const pending = runSetupAt(seam, '/pkg', {});
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);

    await expect(pending).resolves.toEqual({ ok: false, log: '\n创建超时' });
  });

  it('起不来（spawn 报错）→ ok false，错误也进日志而不是抛给界面', async () => {
    const { seam } = seamWith([{ error: new Error('spawn bash ENOENT') }]);

    const outcome = await runSetupAt(seam, '/pkg', {});

    expect(outcome.ok).toBe(false);
    expect(outcome.log).toContain('spawn bash ENOENT');
  });

  it('日志只留最后 20000 字，尾巴能读到最后一行', async () => {
    const noisy = `${'x'.repeat(30_000)}done\n`;
    const { seam } = seamWith([{ exitCode: 0, stdout: noisy }]);

    const outcome = await runSetupAt(seam, '/pkg', {});

    expect(outcome.log.length).toBe(20_000);
    expect(outcome.log.endsWith('done\n')).toBe(true);
  });

  it('profileCreateDepsOf 把执行缝接进 runSetup', async () => {
    const { seam, calls } = seamWith([{ exitCode: 0, stdout: 'ok\n' }]);
    const deps = profileCreateDepsOf(seam, { home: '/home', self: 'workbench', packageRoot: '/pkg' });

    await expect(deps.runSetup?.({ EXTRA: 'y' })).resolves.toEqual({ ok: true, log: 'ok\n' });
    expect(calls[0]?.args).toEqual(['/pkg/bin/dsh-workbench', 'setup']);
    expect(calls[0]?.env['EXTRA']).toBe('y');
  });
});
