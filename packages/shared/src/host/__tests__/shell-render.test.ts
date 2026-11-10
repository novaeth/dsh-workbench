import { describe, expect, it, vi } from 'vitest';
import { callOperatorOf, invocationOf, powershellFileOf, quotedArgvLine, quotedLineOf } from '../shell-render.js';

const existsNamed =
  (...names: readonly string[]) =>
  (file: string): boolean =>
    new Set(names).has(file.split(/[\\/]/).pop() ?? '');

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

  it('win32 只有 powershell.exe：文件换掉，三个启动参数与 & 调用符照旧', () => {
    expect(
      invocationOf('pwsh', "'opencli' 'browser'", {
        platform: 'win32',
        pathValue: 'C:\\Windows\\System32',
        exists: existsNamed('powershell.exe'),
      }),
    ).toEqual({
      file: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', "& 'opencli' 'browser'"],
    });
  });

  it('win32 有 pwsh.exe：照旧 pwsh', () => {
    expect(
      invocationOf('pwsh', 'pnpm add left-pad', {
        platform: 'win32',
        pathValue: 'C:\\Tools',
        exists: existsNamed('pwsh.exe'),
      }),
    ).toEqual({ file: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', 'pnpm add left-pad'] });
  });

  it('win32 两个都没有：仍给 pwsh', () => {
    expect(
      invocationOf('pwsh', 'pnpm add left-pad', { platform: 'win32', pathValue: 'C:\\Tools', exists: () => false }),
    ).toEqual({ file: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', 'pnpm add left-pad'] });
  });

  it('posix：不受 PowerShell 解析影响', () => {
    expect(invocationOf('posix', 'pnpm i', { platform: 'win32', pathValue: 'C:\\Tools', exists: () => true })).toEqual({
      file: 'bash',
      args: ['-c', 'pnpm i'],
    });
  });
});

describe('powershellFileOf', () => {
  it('win32：PATH 里有 pwsh.exe 给 pwsh', () => {
    expect(
      powershellFileOf({
        platform: 'win32',
        pathValue: 'C:\\Windows\\System32;C:\\Tools',
        exists: existsNamed('pwsh.exe', 'powershell.exe'),
      }),
    ).toBe('pwsh');
  });

  it('★ win32：PATH 段被引号包着（安装器常这么写）时仍找得到 pwsh.exe', () => {
    const seen: string[] = [];
    const found = powershellFileOf({
      platform: 'win32',
      pathValue: '"C:\\Tools";C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
      exists: (file) => {
        seen.push(file);
        return file === 'C:\\Tools\\pwsh.exe';
      },
    });
    expect(found).toBe('pwsh');
    expect(seen).toContain('C:\\Tools\\pwsh.exe');
  });

  it('win32：没有 pwsh.exe 但有 powershell.exe 时退回 powershell.exe', () => {
    expect(
      powershellFileOf({ platform: 'win32', pathValue: 'C:\\Windows\\System32', exists: existsNamed('powershell.exe') }),
    ).toBe('powershell.exe');
  });

  it('win32：两个都没有仍给 pwsh（报错继续指向要装的那个）', () => {
    expect(powershellFileOf({ platform: 'win32', pathValue: 'C:\\Windows;C:\\Tools', exists: () => false })).toBe('pwsh');
  });

  it('win32：按 PATH 段顺序先找遍 pwsh.exe 再找 powershell.exe，路径按 win32 拼', () => {
    const seen: string[] = [];
    const exists = (file: string): boolean => {
      seen.push(file);
      return file.endsWith('\\powershell.exe');
    };
    expect(powershellFileOf({ platform: 'win32', pathValue: 'C:\\A;C:\\B', exists })).toBe('powershell.exe');
    expect(seen).toEqual(['C:\\A\\pwsh.exe', 'C:\\B\\pwsh.exe', 'C:\\A\\powershell.exe']);
  });

  it('win32：PATH 空或全是空段时不查文件系统', () => {
    const exists = vi.fn(() => true);
    expect(powershellFileOf({ platform: 'win32', pathValue: ';;', exists })).toBe('pwsh');
    expect(exists).not.toHaveBeenCalled();
  });

  it('非 win32：恒给 pwsh，不去 PATH 里找', () => {
    const exists = vi.fn(() => true);
    expect(powershellFileOf({ platform: 'darwin', pathValue: '/usr/bin', exists })).toBe('pwsh');
    expect(powershellFileOf({ platform: 'linux', pathValue: '/usr/bin', exists })).toBe('pwsh');
    expect(exists).not.toHaveBeenCalled();
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
