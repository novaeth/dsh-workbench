import { describe, expect, it } from 'vitest';
import { callOperatorOf, invocationOf, quotedArgvLine, quotedLineOf } from '../shell-render.js';

describe('callOperatorOf', () => {
  it('pwsh：命令位置带引号时补 & 调用符', () => {
    expect(callOperatorOf('pwsh', "'C:\\Program Files\\opencli\\opencli.cmd' 'browser'")).toBe(
      "& 'C:\\Program Files\\opencli\\opencli.cmd' 'browser'",
    );
    expect(callOperatorOf('pwsh', '"C:\\tools\\x.cmd" list')).toBe('& "C:\\tools\\x.cmd" list');
  });

  it('pwsh：不带引号（或以空白开头的不带引号）原样', () => {
    expect(callOperatorOf('pwsh', 'pnpm install')).toBe('pnpm install');
    expect(callOperatorOf('pwsh', '  pnpm install')).toBe('  pnpm install');
  });

  it('posix 不管引号：bash 里命令位置本来就是命令', () => {
    expect(callOperatorOf('posix', "'opencli' 'browser'")).toBe("'opencli' 'browser'");
  });
});

describe('invocationOf', () => {
  it('pwsh：-NoProfile -NonInteractive -Command，载荷带上 &', () => {
    expect(invocationOf('pwsh', "'opencli' 'browser' 'list'")).toEqual({
      file: 'pwsh',
      args: ['-NoProfile', '-NonInteractive', '-Command', "& 'opencli' 'browser' 'list'"],
    });
  });

  it('pwsh：普通命令行不加 &', () => {
    expect(invocationOf('pwsh', 'pnpm add left-pad')).toEqual({
      file: 'pwsh',
      args: ['-NoProfile', '-NonInteractive', '-Command', 'pnpm add left-pad'],
    });
  });

  it('posix：bash -c，脚本原样', () => {
    expect(invocationOf('posix', "'opencli' 'browser'")).toEqual({ file: 'bash', args: ['-c', "'opencli' 'browser'"] });
  });
});

describe('quotedArgvLine / quotedLineOf', () => {
  it('posix：单引号；内嵌引号关引号再转义', () => {
    expect(quotedArgvLine(['a b', "c'd"], 'darwin')).toBe(`'a b' 'c'\\''d'`);
  });

  it('win32：单引号 + 内嵌引号双写', () => {
    expect(quotedArgvLine(['a b', "c'd"], 'win32')).toBe("'a b' 'c''d'");
  });

  it('空 argv 给空串', () => {
    expect(quotedArgvLine([], 'darwin')).toBe('');
  });

  it('整条 invocation 按目标平台引号', () => {
    expect(quotedLineOf({ file: 'pwsh', args: ['-Command', 'dir'] }, 'win32')).toBe("'pwsh' '-Command' 'dir'");
  });
});
