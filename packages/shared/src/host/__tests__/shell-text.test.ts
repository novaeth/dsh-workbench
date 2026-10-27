import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { quoteShellArg, quoteShellArgFor, tailLines } from '../shell-text.js';

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
  it('win32 用双引号，路径里的空格原样保留', () => {
    expect(quoteShellArgFor('C:\\Program Files\\dsh\\x.cjs', 'win32')).toBe('"C:\\Program Files\\dsh\\x.cjs"');
  });

  it('win32 里值自身的双引号被转义', () => {
    expect(quoteShellArgFor('a"b', 'win32')).toBe('"a\\"b"');
  });

  it('POSIX 仍用单引号', () => {
    expect(quoteShellArgFor("it's", 'darwin')).toBe("'it'\\''s'");
  });
});
