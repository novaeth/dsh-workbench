import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { quoteShellArg, quoteShellArgFor, shellKindOf, tailLines } from '../shell-text.js';

function shellSees(value: string): string {
  return execFileSync('/bin/sh', ['-c', `printf '%s' ${quoteShellArg(value)}`], {
    encoding: 'utf8',
  });
}

describe('quoteShellArg', () => {
  it('普通值原样往返', () => {
    expect(shellSees('example-monorepo')).toBe('example-monorepo');
  });

  it('含空格的路径不被拆成两个参数', () => {
    expect(shellSees('/Volumes/My Projects/app')).toBe('/Volumes/My Projects/app');
  });

  it('单引号被正确转义（否则就是注入面）', () => {
    expect(shellSees("it's")).toBe("it's");
  });

  it('shell 元字符按字面量传递', () => {
    for (const raw of ['$(whoami)', '`id`', 'a; rm -rf /', 'a && b', '*', '"double"', '\\n']) {
      expect(shellSees(raw), raw).toBe(raw);
    }
  });
});

describe('tailLines', () => {
  it('取末尾若干行并去掉首尾空行', () => {
    expect(tailLines('\n a \n b \n', 2)).toBe('a \n b');
  });

  it('行数不够时全给', () => {
    expect(tailLines('only', 6)).toBe('only');
  });

  it('空输入给空串', () => {
    expect(tailLines(undefined, 3)).toBe('');
    expect(tailLines('   ', 3)).toBe('');
  });
});


describe('quoteShellArgFor', () => {
  it('★ win32 按 pwsh 的字面量走：单引号，路径里的空格与反斜杠都原样', () => {
    expect(quoteShellArgFor('C:\\Program Files\\dsh\\x.cjs', 'win32')).toBe("'C:\\Program Files\\dsh\\x.cjs'");
  });

  it('★ pwsh 里值自身的单引号按双写逃逸（不是 POSIX 那套反斜杠）', () => {
    expect(quoteShellArgFor("it's", 'win32')).toBe("'it''s'");
  });

  it('★ pwsh 里 $ 与双引号不再被当成语法（单引号内是字面量）', () => {
    expect(quoteShellArgFor('a$b"c', 'win32')).toBe(`'a$b"c'`);
  });

  it('POSIX 仍用单引号加反斜杠逃逸', () => {
    expect(quoteShellArgFor("it's", 'darwin')).toBe("'it'\\''s'");
  });
});

describe('shellKindOf', () => {
  it('win32 是 pwsh，其余是 POSIX', () => {
    expect(shellKindOf('win32')).toBe('pwsh');
    expect(shellKindOf('darwin')).toBe('posix');
    expect(shellKindOf('linux')).toBe('posix');
  });
});
