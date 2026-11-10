import { describe, expect, it } from 'vitest';
import {
  classifyInstallFailure,
  installFailureOf,
  installTargets,
  installVerbAt,
  installWriteProblem,
  writeStateOf,
} from '../install-failure.js';

const CURRENT = { uid: 502, gid: 20 };

describe('installTargets（从我们自己的安装命令里挑出写点）', () => {
  it('挑出 --prefix 与原样带空格的路径', () => {
    expect(installTargets(`npm i --prefix '/Users/a b/x' foo@1 --cache /tmp/c`)).toEqual([
      '/Users/a b/x',
      '/tmp/c',
    ]);
  });

  it('没有 --prefix / --cache 就没有写点', () => {
    expect(installTargets('npm ls --json --depth 0')).toEqual([]);
  });
});

describe('classifyInstallFailure', () => {
  it('EPERM / EACCES 都算权限', () => {
    expect(classifyInstallFailure('npm error code EACCES')).toBe('permission');
    expect(classifyInstallFailure('npm error syscall open errno EPERM')).toBe('permission');
  });

  it('ENOSPC 是盘满', () => {
    expect(classifyInstallFailure('ENOSPC: no space left on device')).toBe('disk-full');
  });

  it('认不出来就说认不出来', () => {
    expect(classifyInstallFailure('')).toBe('unknown');
  });
});

describe('installFailureOf（从现场推到修法）', () => {
  it('属主不是当前账号 → chown 回自己', () => {
    const failure = installFailureOf({
      command: 'npm i --prefix /x foo@1',
      exitCode: 1,
      output: 'EACCES: permission denied',
      path: '/x',
      owner: { uid: 0, gid: 0 },
      mode: '755',
      writable: false,
      current: CURRENT,
    });

    expect(failure.kind).toBe('permission');
    expect(failure.fix).toEqual({ kind: 'chown', path: '/x', uid: 502, gid: 20 });
  });

  it('属主是自己、只是没写位 → chmod，不给 sudo', () => {
    const failure = installFailureOf({
      command: 'npm i --prefix /x foo@1',
      exitCode: 1,
      output: 'EACCES: permission denied',
      path: '/x',
      owner: { uid: 502, gid: 20 },
      mode: '555',
      writable: false,
      current: CURRENT,
    });

    expect(failure.fix).toEqual({ kind: 'chmod', path: '/x' });
  });

  it('属主是自己、明明可写却报 EPERM → 是被别的沙箱拦的，不给一条没用的 sudo', () => {
    const failure = installFailureOf({
      command: 'npm i --prefix /x foo@1',
      exitCode: 1,
      output: 'EPERM: operation not permitted',
      path: '/x',
      owner: { uid: 502, gid: 20 },
      mode: '755',
      writable: true,
      current: CURRENT,
    });

    expect(failure.kind).toBe('sandbox');
    expect(failure.fix).toEqual({ kind: 'handoff' });
  });

  it('盘满 → 指向精简的命令，而不是 chown', () => {
    const failure = installFailureOf({
      command: 'npm i --prefix /x foo@1',
      exitCode: 1,
      output: 'ENOSPC: no space left on device',
      path: '/x',
      current: CURRENT,
    });

    expect(failure.kind).toBe('disk-full');
    expect(failure.fix).toEqual({ kind: 'space', path: '/x' });
  });

  it('认不出来 → 交接给 agent，不硬猜修法', () => {
    const failure = installFailureOf({
      command: 'npm i --prefix /x foo@1',
      exitCode: 255,
      output: 'something odd',
      current: CURRENT,
    });

    expect(failure.kind).toBe('unknown');
    expect(failure.fix).toEqual({ kind: 'handoff' });
  });
});

describe('installWriteProblem（装之前先看一眼，省得白跑）', () => {
  it('只盯安装动词：npm ls 这种读命令不拦', () => {
    expect(installWriteProblem({ command: 'npm ls --prefix /x foo --json' })).toBeUndefined();
  });

  it('目录不存在 → 退到最近的祖先，不报假问题', () => {
    expect(installWriteProblem({ command: `npm i --prefix ${process.cwd()}/definitely-missing-dir foo` })).toBeUndefined();
  });

  it('★ 包管理器是绝对路径 / 经 node 起的时候照样认得出安装动词（DSH_WB_PNPM 指向具体文件）', () => {
    expect(installVerbAt("'/Applications/x/node' '/Users/me/.dsh/workbench/pnpm.cjs' add --dir '/x' foo")).toBe(2);
    expect(installVerbAt("'/usr/local/bin/pnpm' add --dir '/x' foo")).toBe(1);
    expect(installVerbAt("C:\\node\\node.exe C:\\tools\\pnpm.cmd install --dir C:\\x")).toBe(2);
    expect(installVerbAt("'/usr/local/bin/pnpm' remove --dir '/x' foo")).toBeUndefined();
    expect(installVerbAt("echo 'warehouse'")).toBeUndefined();
  });
});

describe('writeStateOf（可写判定按 errno 归一）', () => {
  const throwsCode =
    (code: string) =>
    (): void => {
      throw Object.assign(new Error(code), { code });
    };

  it('★ EACCES 与 EPERM 都算被拒（Windows 上访问被拒常报 EPERM）', () => {
    expect(writeStateOf('/x', throwsCode('EACCES'))).toBe('denied');
    expect(writeStateOf('/x', throwsCode('EPERM'))).toBe('denied');
    expect(writeStateOf('/x', throwsCode('ENOENT'))).toBe('unknown');
  });
});
