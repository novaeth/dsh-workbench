import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createOpencli, opencliCommandLine, OPENCLI_WINDOW_ENV } from '../cli/index.js';

describe('opencli 命令行按平台拼', () => {
  it('★ POSIX：命令行里不带环境变量前缀（那是 shell 语法，不是命令的一部分）', () => {
    const line = opencliCommandLine('opencli', ['coding', 'issues'], 'persistent', 'darwin');

    expect(line).toBe(`'opencli' 'coding' 'issues' --site-session persistent -f json`);
  });

  it('★ win32：同样不带前缀，参数按 pwsh 的字面量引号', () => {
    const line = opencliCommandLine('opencli', ['coding', 'issues'], 'persistent', 'win32');

    expect(line).not.toContain('env ');
    expect(line).not.toContain('$env:');
    expect(line).toBe(`'opencli' 'coding' 'issues' --site-session persistent -f json`);
  });

  it('★ win32：带空格的路径是字面量，不会被 pwsh 拆开', () => {
    const line = opencliCommandLine('C:\\Program Files\\opencli\\opencli.cmd', ['browser', 'list'], 'none', 'win32');

    expect(line).toBe(`'C:\\Program Files\\opencli\\opencli.cmd' 'browser' 'list' -f json`);
  });

  it('★ 窗口模式走宿主的环境变量覆盖，不走命令行', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const fake = createFakeShell([{ stdout: '[]' }]);
    const shell: DshShell = {
      resolve: (request) => {
        seen.push(request as unknown as Record<string, unknown>);
        return fake.shell.resolve(request);
      },
      execute: (spec) => fake.shell.execute(spec),
    };
    const opencli = createOpencli({ shell, plugin: 'coding' });

    await opencli.json(['list']).catch(() => undefined);

    expect(seen[0]?.env).toEqual(OPENCLI_WINDOW_ENV);
    expect(String(seen[0]?.command ?? '')).not.toContain('OPENCLI_WINDOW');
  });
});
