import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createCommandReader } from '../index.js';

describe('createCommandReader', () => {
  it('按 argv 拼一条带引号的命令，返回原始 stdout/stderr/exitCode', async () => {
    const fake = createFakeShell([{ stdout: 'ok\n', stderr: 'warn\n' }]);
    const commands = createCommandReader({ shell: fake.shell });
    const result = await commands.run({ argv: ['gitops', 'ls', '--kind', 'app'] });
    expect(result).toMatchObject({
      stdout: 'ok\n',
      stderr: 'warn\n',
      exitCode: 0,
      timedOut: false,
      filePaths: [],
    });
    expect(fake.commands()).toEqual(["'gitops' 'ls' '--kind' 'app'"]);
  });

  it('files 写临时文件、按 appendFileArgs 追加，并在跑完后清掉', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-cmd-test-'));
    const fake = createFakeShell([{ stdout: '{}' }]);
    const commands = createCommandReader({ shell: fake.shell, tmpRoot: root });
    const result = await commands.run({
      argv: ['gitops', 'set', 'x'],
      files: [{ content: 'hello' }],
      appendFileArgs: '--file',
    });
    expect(result.filePaths).toHaveLength(1);
    expect(fake.commands()[0]).toContain("'--file'");
    expect(existsSync(result.filePaths[0] ?? '')).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('超时与执行错误都折进结果，不抛', async () => {
    const timeout = createFakeShell([{ timedOut: true, stderr: 'slow' }]);
    await expect(
      createCommandReader({ shell: timeout.shell }).run({ argv: ['gitops'] }),
    ).resolves.toMatchObject({ timedOut: true, stderr: 'slow' });

    const boom = createFakeShell([{ failWith: new Error('boom') }]);
    await expect(
      createCommandReader({ shell: boom.shell }).run({ argv: ['gitops'] }),
    ).resolves.toMatchObject({ exitCode: -1, error: 'Error: boom' });
  });

  it('env 是叠加给宿主 shell 的覆盖，命令行里不拼前缀', async () => {
    const fake = createFakeShell([{ stdout: 'ok' }]);
    await createCommandReader({ shell: fake.shell }).run({
      argv: ['gitops', 'ls'],
      env: { GITOPS_PROFILE: 'work' },
    });
    expect(fake.calls[0]?.env).toEqual({ GITOPS_PROFILE: 'work' });
    expect(fake.commands()[0]).toBe("'gitops' 'ls'");
  });

  it('输出被宿主截断时把 truncated 带出来', async () => {
    const fake = createFakeShell([{ stdout: 'half', truncated: true }]);
    await expect(
      createCommandReader({ shell: fake.shell }).run({ argv: ['gitops'] }),
    ).resolves.toMatchObject({ stdout: 'half', truncated: true });
  });
});
