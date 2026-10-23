import { describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createOriginReader } from '@dsh-workbench/shared/host';

describe('createOriginReader', () => {
  it('拿到 origin → ok（去掉尾换行）', async () => {
    const fake = createFakeShell([{ stdout: 'git@example.com:a/b/c.git\n' }]);

    const read = await createOriginReader({ shell: fake.shell })('/w/x');

    expect(read).toEqual({ kind: 'ok', remote: 'git@example.com:a/b/c.git' });
  });

  it('非零退出（没仓库 / 没 origin）→ no-origin + stderr 尾行', async () => {
    const fake = createFakeShell([{ exitCode: 2, stderr: 'fatal: not a git repository' }]);

    const read = await createOriginReader({ shell: fake.shell })('/w/x');

    expect(read.kind).toBe('no-origin');
    expect(read.kind === 'no-origin' && read.detail).toContain('not a git repository');
  });

  it('执行缝故障 → unknown/exec-failed，并 warn', async () => {
    const warn = vi.fn();
    const fake = createFakeShell([{ failWith: new Error('boom') }]);

    const read = await createOriginReader({ shell: fake.shell, logger: { warn } })('/w/x');

    expect(read.kind === 'unknown' && read.reason).toBe('exec-failed');
    expect(warn).toHaveBeenCalled();
  });

  it('没有路径 → 不跑命令，直接 unknown/no-path', async () => {
    const fake = createFakeShell([{ stdout: 'x\n' }]);

    const read = await createOriginReader({ shell: fake.shell })('  ');

    expect(read.kind === 'unknown' && read.reason).toBe('no-path');
    expect(fake.calls).toHaveLength(0);
  });

  it('不缓存：两次调用就是两次真实读取', async () => {
    const fake = createFakeShell([{ stdout: 'a\n' }, { stdout: 'a\n' }]);

    const readOrigin = createOriginReader({ shell: fake.shell });
    await readOrigin('/w/x');
    await readOrigin('/w/x');

    expect(fake.calls).toHaveLength(2);
  });
});
