import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import {
  coversWritableRoot,
  isInstalledCopy,
  opencliWrapperScript,
  packageRootOf,
  prependPath,
  runDetached,
  runtimeSeedPaths,
  runtimeSeedRootOf,
  seedRuntimeFiles,
  warnUnwritableRoot,
  workshopSeedPlan,
} from '@dsh-workbench/adapters-default';

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-seed-'));
  roots.push(dir);
  return dir;
}

function fakePackageRoot(root: string): string {
  const pkg = join(root, 'pkg');
  mkdirSync(join(pkg, 'bin'), { recursive: true });
  writeFileSync(join(pkg, 'bin', 'opencli-isolated'), '#!/usr/bin/env bash\n', 'utf8');
  return pkg;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('runtimeSeedPaths', () => {
  it('全部落点都从工作台根推出来（与启动器那份一致）', () => {
    const root = '/dsh/workbench';
    const paths = runtimeSeedPaths(root);
    expect(paths.entryDir).toBe('/dsh/workbench/bin');
    expect(paths.opencliBin).toBe('/dsh/workbench/opencli/bin/opencli');
    expect(paths.opencliHome).toBe('/dsh/workbench/opencli/home');
    expect(paths.workshopPackages).toBe('/dsh/workbench/diy/packages');
    expect(paths.workshopManifest).toBe('/dsh/workbench/diy/package.json');
  });

  it('★ Windows 的启动器落点是 opencli.cmd', () => {
    expect(runtimeSeedPaths('/dsh/workbench', 'win32').opencliBin).toBe('/dsh/workbench/opencli/bin/opencli.cmd');
  });
});

describe('runtimeSeedRootOf', () => {
  it('工作台根走 DSH_WORKBENCH_HOME，没设时退回 $DSH_HOME/workbench', () => {
    vi.stubEnv('DSH_HOME', '/home/dsh');
    const ctx = {
      get: (name: string) =>
        name === 'dshHomePath' ? (rel: string) => join('/home/dsh', rel) : undefined,
    } as unknown as DshHostContext;
    expect(runtimeSeedRootOf(ctx)).toBe(join('/home/dsh', 'workbench'));
    vi.stubEnv('DSH_WORKBENCH_HOME', '/home/dsh/workbench-2');
    expect(runtimeSeedRootOf(ctx)).toBe('/home/dsh/workbench-2');
  });

  it('没有 dshHomePath 服务时回 null（自举宁可不做，也不带崩宿主）', () => {
    expect(runtimeSeedRootOf({ get: () => undefined } as unknown as DshHostContext)).toBeNull();
  });
});

describe('coversWritableRoot', () => {
  it('工作台根等于可写根、或在它下面，才算盖住', () => {
    expect(coversWritableRoot('/home/dsh/workbench', '/home/dsh/workbench')).toBe(true);
    expect(coversWritableRoot('/home/dsh', '/home/dsh/workbench')).toBe(true);
    expect(coversWritableRoot('/home/', '/home/workbench')).toBe(true);
  });

  it('同名前缀不算（/home/dsh2 不在 /home/dsh 下面）、父目录也不算', () => {
    expect(coversWritableRoot('/home/dsh', '/home/dsh2/workbench')).toBe(false);
    expect(coversWritableRoot('/home/dsh/workbench', '/home/dsh')).toBe(false);
    expect(coversWritableRoot('/home/dsh/workbench', '/tmp/workbench')).toBe(false);
  });
});

describe('warnUnwritableRoot', () => {
  const ctxWith = (workspaceRoot: string, warn: ReturnType<typeof vi.fn>) =>
    ({
      get: (name: string) => {
        if (name === 'dshHomePath') return (rel: string) => join('/home/dsh', rel);
        if (name === 'sandboxPolicy') return { workspaceRoot };
        return undefined;
      },
      logger: { warn },
    }) as unknown as DshHostContext;

  it('可写根盖住工作台根时不说一句', () => {
    vi.stubEnv('DSH_WORKBENCH_HOME', '/home/dsh/workbench');
    const warn = vi.fn();
    warnUnwritableRoot(ctxWith('/home/dsh', warn));
    expect(warn).not.toHaveBeenCalled();
  });

  it('盖不住时打一条带修复指向的 warn', () => {
    vi.stubEnv('DSH_WORKBENCH_HOME', '/home/dsh/workbench');
    const warn = vi.fn();
    warnUnwritableRoot(ctxWith('/tmp/other', warn));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cordis.patch.yml'));
  });

  it('没有 sandboxPolicy 服务时沉默（桩宿主 / 只跑自举的场景）', () => {
    const warn = vi.fn();
    warnUnwritableRoot({ get: () => undefined, logger: { warn } } as unknown as DshHostContext);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('packageRootOf', () => {
  it('源码入口与打包产物入口推出来的是同一个包根', () => {
    expect(packageRootOf('file:///pkg/src/app/host.ts')).toBe('/pkg');
    expect(packageRootOf('file:///pkg/dist/host/index.js')).toBe('/pkg');
  });
});

describe('isInstalledCopy', () => {
  it('路径里有 node_modules 段 = 安装包副本（自举的重活只对它做）', () => {
    expect(isInstalledCopy('/Users/x/.dsh/profiles/web/node_modules/@dsh-workbench/core')).toBe(true);
    expect(isInstalledCopy('/Users/x/npm/_npx/abc/node_modules/@dsh-workbench/core')).toBe(true);
    expect(isInstalledCopy('/Users/x/repo/packages/core')).toBe(false);
  });
});

describe('opencliWrapperScript', () => {
  it('是一份 sh 脚本，exec 到自己那份 bin/opencli-isolated.mjs（隔离靠它换 HOME）', () => {
    const script = opencliWrapperScript('/pkg', '/home/.dsh');
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain("export DSH_HOME='/home/.dsh'");
    expect(script).toContain("exec node '/pkg/bin/opencli-isolated.mjs' \"$@\"");
  });

  it('把 DSH_HOME 钉在命令里：执行缝不继承它，不钉就会去写用户真正的 ~/.dsh（实测踩过）', () => {
    expect(opencliWrapperScript('/pkg', '/custom/home')).toContain("DSH_HOME='/custom/home'");
  });

  it('路径里有空格也不散架（单引号包住，执行缝里不会被拆成两个词）', () => {
    const script = opencliWrapperScript('/Volumes/my disk/pkg', '/Volumes/my disk/dsh');
    expect(script).toContain("'/Volumes/my disk/pkg/bin/opencli-isolated.mjs'");
    expect(script).toContain("DSH_HOME='/Volumes/my disk/dsh'");
  });

  it('★ Windows 生成 .cmd，不再依赖 sh/bash', () => {
    const script = opencliWrapperScript('C:\\Program Files\\wb', 'C:\\Users\\me\\.dsh', 'win32');
    expect(script.startsWith('@echo off\r\n')).toBe(true);
    expect(script).toContain('set "DSH_HOME=C:\\Users\\me\\.dsh"');
    expect(script).toContain('opencli-isolated.mjs');
    expect(script).toContain('%*');
  });
});

describe('workshopSeedPlan', () => {
  it('跑随包那份 seed-workshop.sh，不把骨架抄进 TS；DSH_HOME 与外壳基准走 env，输出落一份日志', () => {
    expect(workshopSeedPlan('/pkg', '/home/.dsh', '/home/.dsh/workbench')).toEqual({
      entry: {
        file: 'bash',
        args: ['/pkg/scripts/seed-workshop.sh', 'entry'],
        env: { DSH_HOME: '/home/.dsh', DSH_WB_SHELL_ROOT: '/pkg' },
        log: '/home/.dsh/workbench/seed.log',
      },
      full: {
        file: 'bash',
        args: ['/pkg/scripts/seed-workshop.sh'],
        env: { DSH_HOME: '/home/.dsh', DSH_WB_SHELL_ROOT: '/pkg' },
        log: '/home/.dsh/workbench/seed.log',
      },
    });
  });

  it('★ Windows 先过 Node 入口，不再直接 spawn bash', () => {
    const plan = workshopSeedPlan('/pkg', '/home/.dsh', '/home/.dsh/workbench', 'win32');
    expect(plan.entry.file).toBe(process.execPath);
    expect(plan.entry.args[0]).toBe('/pkg/bin/seed-workshop-windows.mjs');
    expect(plan.entry.args.slice(1)).toEqual(['entry', '/pkg/scripts/seed-workshop.sh']);
    expect(plan.entry.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(plan.full.args.slice(1)).toEqual(['full', '/pkg/scripts/seed-workshop.sh']);
  });
});

describe('runDetached', () => {
  it('脱离父进程跑，把 DSH_HOME 合进 env，输出写进日志文件（后台跑的东西不许无声）', () => {
    const root = tempRoot();
    const logPath = join(root, 'seed.log');
    const calls: { file: string; args: readonly string[]; options: Record<string, unknown> }[] = [];
    const spawnImpl = ((file: string, args: readonly string[], options: Record<string, unknown>) => {
      calls.push({ file, args, options });
      return { on: () => {}, unref: () => {} };
    }) as unknown as typeof spawn;
    process.env.DSH_WORKBENCH_TEST_KEEP = 'kept';
    runDetached(
      { file: 'bash', args: ['/s.sh', 'entry'], env: { DSH_HOME: '/home/.dsh' }, log: logPath },
      () => {},
      spawnImpl,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe('bash');
    expect(calls[0]?.args).toEqual(['/s.sh', 'entry']);
    expect(calls[0]?.options.detached).toBe(true);
    expect((calls[0]?.options.stdio as unknown[])[0]).toBe('ignore');
    expect(typeof (calls[0]?.options.stdio as unknown[])[1]).toBe('number');
    expect(existsSync(logPath)).toBe(true);
    expect(calls[0]?.options.env).toMatchObject({ DSH_HOME: '/home/.dsh', DSH_WORKBENCH_TEST_KEEP: 'kept' });
    delete process.env.DSH_WORKBENCH_TEST_KEEP;
  });

  it('子进程报错时留一句话（不是静默什么都没有）', () => {
    const root = tempRoot();
    const listeners: ((error: unknown) => void)[] = [];
    const spawnImpl = (() => ({
      on: (_event: string, listener: (error: unknown) => void) => {
        listeners.push(listener);
      },
      unref: () => {},
    })) as unknown as typeof spawn;
    const log = vi.fn();
    runDetached({ file: 'bash', args: ['/s.sh'], env: {}, log: join(root, 'seed.log') }, log, spawnImpl);
    listeners[0]?.(new Error('boom'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('自举脚本没跑起来'));
  });

  it('连 spawn 都抛（例如 bash 不在）也留一句话、并把日志描述符收回去', () => {
    const root = tempRoot();
    const spawnImpl = (() => {
      throw new Error('spawn failed');
    }) as unknown as typeof spawn;
    const log = vi.fn();
    runDetached({ file: 'bash', args: ['/s.sh'], env: {}, log: join(root, 'seed.log') }, log, spawnImpl);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('spawn failed'));
  });

  it('日志文件打不开（目录没了）也留一句话，不带崩宿主', () => {
    const root = tempRoot();
    const spawnImpl = (() => ({ on: () => {}, unref: () => {} })) as unknown as typeof spawn;
    const log = vi.fn();
    runDetached({ file: 'bash', args: ['/s.sh'], env: {}, log: join(root, 'nope', 'seed.log') }, log, spawnImpl);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('自举脚本没跑起来'));
  });
});

describe('prependPath', () => {
  it('前插一次；已经在里面就不再插第二遍', () => {
    const env: NodeJS.ProcessEnv = { PATH: ['/usr/bin', '/bin'].join(delimiter) };
    expect(prependPath('/dsh/bin', env)).toBe(true);
    expect(env.PATH).toBe(['/dsh/bin', '/usr/bin', '/bin'].join(delimiter));
    expect(prependPath('/dsh/bin', env)).toBe(false);
    expect(env.PATH).toBe(['/dsh/bin', '/usr/bin', '/bin'].join(delimiter));
  });

  it('PATH 还没设或只有空段时也插得进去', () => {
    const empty: NodeJS.ProcessEnv = {};
    expect(prependPath('/dsh/bin', empty)).toBe(true);
    expect(empty.PATH).toBe('/dsh/bin');
    const padded: NodeJS.ProcessEnv = { PATH: `${delimiter}/usr/bin${delimiter}` };
    expect(prependPath('/dsh/bin', padded)).toBe(true);
    expect(padded.PATH).toBe(['/dsh/bin', '/usr/bin'].join(delimiter));
  });
});

describe('seedRuntimeFiles', () => {
  it('建目录 + 写隔离 opencli 入口，并报出自己做了什么', () => {
    const root = tempRoot();
    const pkg = fakePackageRoot(root);
    const workbench = join(root, '.dsh', 'workbench');
    const paths = runtimeSeedPaths(workbench);

    const done = seedRuntimeFiles({ root: workbench, home: join(root, '.dsh'), packageRoot: pkg });

    expect(done).toEqual([paths.opencliBin]);
    expect(existsSync(paths.entryDir)).toBe(true);
    expect(existsSync(paths.opencliHome)).toBe(true);
    expect(existsSync(paths.workshopPackages)).toBe(true);
    expect(readFileSync(paths.opencliBin, 'utf8')).toBe(opencliWrapperScript(pkg, join(root, '.dsh')));
    expect(statSync(paths.opencliBin).mode & 0o777).toBe(0o755);
  });

  it('★ Windows 写 .cmd 入口，不再需要 sh/bash', () => {
    const root = tempRoot();
    const pkg = fakePackageRoot(root);
    const workbench = join(root, '.dsh', 'workbench');
    const paths = runtimeSeedPaths(workbench, 'win32');

    const done = seedRuntimeFiles({
      root: workbench,
      home: join(root, '.dsh'),
      packageRoot: pkg,
      platform: 'win32',
    });

    expect(done).toEqual([paths.opencliBin]);
    expect(paths.opencliBin.endsWith('opencli.cmd')).toBe(true);
    expect(readFileSync(paths.opencliBin, 'utf8').startsWith('@echo off\r\n')).toBe(true);
  });

  it('第二遍什么都不写（幂等：启动几次都不会把已有现场改掉）', () => {
    const root = tempRoot();
    const pkg = fakePackageRoot(root);
    const workbench = join(root, '.dsh', 'workbench');
    seedRuntimeFiles({ root: workbench, home: join(root, '.dsh'), packageRoot: pkg });

    expect(seedRuntimeFiles({ root: workbench, home: join(root, '.dsh'), packageRoot: pkg })).toEqual([]);
  });

  it('入口指错了（换过包位置 / 被旧版本留下）就重写', () => {
    const root = tempRoot();
    const pkg = fakePackageRoot(root);
    const workbench = join(root, '.dsh', 'workbench');
    const paths = runtimeSeedPaths(workbench);
    mkdirSync(paths.opencliBinDir, { recursive: true });
    writeFileSync(paths.opencliBin, '#!/bin/sh\nexec bash /gone/bin/opencli-isolated "$@"\n', 'utf8');

    expect(seedRuntimeFiles({ root: workbench, home: join(root, '.dsh'), packageRoot: pkg })).toContain(paths.opencliBin);
    expect(readFileSync(paths.opencliBin, 'utf8')).toBe(opencliWrapperScript(pkg, join(root, '.dsh')));
  });

  it('工作台根根本建不出来（被文件占着 / 没权限）时只留一句话', () => {
    const root = tempRoot();
    const pkg = fakePackageRoot(root);
    const blocked = join(root, 'workbench');
    writeFileSync(blocked, 'not a directory', 'utf8');
    const log = vi.fn();

    expect(seedRuntimeFiles({ root: blocked, home: join(root, '.dsh'), packageRoot: pkg, log })).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('自举没做完'));
  });
});
