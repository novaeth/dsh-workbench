import { describe, expect, it } from 'vitest';
import { commandNamesMatch } from '../command-name.js';

describe('commandNamesMatch：声明的命令名与解析出来的命令路径', () => {
  it('缺省 opencli 不管写成名字还是绝对路径都算同一个', () => {
    expect(commandNamesMatch('opencli', '/Users/me/.dsh/workbench/opencli/bin/opencli')).toBe(true);
    expect(commandNamesMatch('opencli.cmd', 'C:\\dsh\\opencli.cmd')).toBe(true);
    expect(commandNamesMatch('opencli.exe', 'C:\\dsh\\opencli.exe')).toBe(true);
    expect(commandNamesMatch('gitops', '/usr/local/bin/gitops')).toBe(true);
  });

  it('不同的命令不算同一个', () => {
    expect(commandNamesMatch('gitops', '/usr/local/bin/opencli')).toBe(false);
    expect(commandNamesMatch('', 'opencli')).toBe(false);
  });
});
