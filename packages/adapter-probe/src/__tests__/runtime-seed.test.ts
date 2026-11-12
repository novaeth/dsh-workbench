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
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { createSeam, quoteShellArgFor } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';
import { isInstalledCopy, localPnpmBin, localPnpmCommand, opencliWrapperScript, packageRootOf, prependPath, runDetached, runtimeSeedPaths, runtimeSeedRootOf, seedRuntimeFiles, seedWorkbenchToolchain, workshopSeedPlan } from '../index.js';


const describePosix = process.platform === 'win32' ? describe.skip : describe;

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

describePosix('runtimeSeedPaths', () => {
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

describePosix('runtimeSeedRootOf', () => {
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

  it('没有 dshHomePath 服务也回工作台根（根算法只有一份）', () => {
    vi.stubEnv('DSH_HOME', '/home/dsh');
    expect(runtimeSeedRootOf({ get: () => undefined } as unknown as DshHostContext)).toBe(
      join('/home/dsh', 'workbench'),
    );
  });
});

describePosix('packageRootOf', () => {
  it('源码入口与打包产物入口推出来的是同一个包根', () => {
    expect(packageRootOf('file:///pkg/src/app/host.ts')).toBe('/pkg');
    expect(packageRootOf('file:///pkg/dist/host/index.js')).toBe('/pkg');
  });
});

describePosix('isInstalledCopy', () => {
  it('路径里有 node_modules 段 = 安装包副本（自举的重活只对它做）', () => {
    expect(isInstalledCopy('/Users/x/.dsh/profiles/web/node_modules/@dsh-workbench/core')).toBe(true);
    expect(isInstalledCopy('/Users/x/npm/_npx/abc/node_modules/@dsh-workbench/core')).toBe(true);
    expect(isInstalledCopy('/Users/x/repo/packages/core')).toBe(false);
  });
});

describePosix('opencliWrapperScript', () => {
  it('是一份 sh 脚本，exec 到运行时适配器那份 bin/opencli-isolated.mjs（隔离靠它换 HOME）', () => {
    const script = opencliWrapperScript('/pkg', '/home/.dsh');
    const expected = fileURLToPath(new URL('../../../adapter-runtime/bin/opencli-isolated.mjs', import.meta.url));
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain("export DSH_HOME='/home/.dsh'");
    expect(script).toContain(`exec 'node' '${expected}' "$@"`);
  });

  it('把 DSH_HOME 钉在命令里：执行缝不继承它，不钉就会去写用户真正的 ~/.dsh（实测踩过）', () => {
    expect(opencliWrapperScript('/pkg', '/custom/home')).toContain("DSH_HOME='/custom/home'");
  });

  it('★ 给了绝对 node 就用它：启动早期 PATH 上可能还没有 Desktop 自带的 node', () => {
    const script = opencliWrapperScript('/pkg', '/home/.dsh', 'darwin', '/home/.dsh/workbench/opencli/bin/desktop/node');
    expect(script).toContain("exec '/home/.dsh/workbench/opencli/bin/desktop/node'");

    const win = opencliWrapperScript('/pkg', 'C:\\Users\\me\\.dsh', 'win32', 'C:\\Users\\me\\.dsh\\workbench\\opencli\\bin\\desktop\\node.cmd');
    expect(win).toContain('"C:\\Users\\me\\.dsh\\workbench\\opencli\\bin\\desktop\\node.cmd"');
    expect(win).not.toContain('\r\nnode "');
  });

  it('路径里有空格也不散架（单引号包住，执行缝里不会被拆成两个词）', () => {
    const script = opencliWrapperScript('/Volumes/my disk/pkg', '/Volumes/my disk/dsh');
    const expected = fileURLToPath(new URL('../../../adapter-runtime/bin/opencli-isolated.mjs', import.meta.url));
    expect(script).toContain(`'${expected}'`);
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

describePosix('workshopSeedPlan', () => {
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

describePosix('runDetached', () => {
  it('★ 交给宿主域 spawn：argv 是脚本本身、日志落给定文件、env 带上自举变量、脱离父进程', () => {
    const root = tempRoot();
    const logPath = join(root, 'seed.log');
    const processes = createFakeProcesses([{}]);
    const seam = createSeam({
      shell: createFakeShell([{}]).shell,
      runtimeRoot: '/tmp/wb-seam-test',
      allowHost: true,
      processes: processes.host,
    });
    process.env.DSH_WORKBENCH_TEST_KEEP = 'kept';
    try {
      runDetached(
        { file: 'bash', args: ['/s.sh', 'entry'], env: { DSH_HOME: '/home/.dsh' }, log: logPath },
        () => {},
        seam,
      );
    } finally {
      delete process.env.DSH_WORKBENCH_TEST_KEEP;
    }

    expect(processes.calls).toHaveLength(1);
    expect(processes.calls[0]?.file).toBe('bash');
    expect(processes.calls[0]?.args).toEqual(['/s.sh', 'entry']);
    expect(processes.calls[0]?.logFile).toBe(logPath);
    expect(processes.calls[0]?.env['DSH_HOME']).toBe('/home/.dsh');
    expect(processes.calls[0]?.env['DSH_WORKBENCH_TEST_KEEP']).toBe('kept');
    expect(processes.children[0]?.unrefed).toBe(true);
    expect(seam.facts().filter((fact) => fact.verb === 'spawn')).toHaveLength(1);
  });

  it('子进程报错时留一句话（不是静默什么都没有）', async () => {
    const root = tempRoot();
    const processes = createFakeProcesses([{ error: new Error('boom') }]);
    const seam = createSeam({
      shell: createFakeShell([{}]).shell,
      runtimeRoot: '/tmp/wb-seam-test',
      allowHost: true,
      processes: processes.host,
    });
    const log = vi.fn();
    runDetached({ file: 'bash', args: ['/s.sh'], env: {}, log: join(root, 'seed.log') }, log, seam);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(log).toHaveBeenCalledWith(expect.stringContaining('自举脚本没跑起来'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('连起进程都抛（例如 bash 不在）也留一句话', () => {
    const root = tempRoot();
    const seam = createSeam({
      shell: createFakeShell([{}]).shell,
      runtimeRoot: '/tmp/wb-seam-test',
      allowHost: true,
      processes: {
        spawn() {
          throw new Error('spawn failed');
        },
      },
    });
    const log = vi.fn();
    runDetached({ file: 'bash', args: ['/s.sh'], env: {}, log: join(root, 'seed.log') }, log, seam);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('spawn failed'));
  });

  it('没有执行缝时退回「自举没跑」，不带崩宿主', () => {
    const root = tempRoot();
    const log = vi.fn();
    runDetached({ file: 'bash', args: ['/s.sh'], env: {}, log: join(root, 'seed.log') }, log);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('自举脚本没跑起来'));
  });
});

describePosix('prependPath', () => {
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

describePosix('seedRuntimeFiles', () => {
  it('建目录 + 写隔离 opencli 入口，并报出自己做了什么', () => {
    const root = tempRoot();
    const pkg = fakePackageRoot(root);
    const workbench = join(root, '.dsh', 'workbench');
    const paths = runtimeSeedPaths(workbench);
    const stale = join(paths.opencliRoot, 'toolchain');
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, 'package.json'), '{"dependencies":{"opencli-workflow":"^1.1.23"}}', 'utf8');
    writeFileSync(join(stale, 'pnpm-workspace.yaml'), 'allowBuilds: {}\n', 'utf8');

    const done = seedRuntimeFiles({ root: workbench, home: join(root, '.dsh'), packageRoot: pkg });

    expect(done).toContain(paths.opencliBin);
    expect(done).toContain(join(paths.opencliRoot, 'toolchain', 'package.json'));
    expect(existsSync(paths.entryDir)).toBe(true);
    expect(existsSync(paths.opencliHome)).toBe(true);
    expect(existsSync(paths.workshopPackages)).toBe(true);
    expect(readFileSync(paths.opencliBin, 'utf8')).toBe(opencliWrapperScript(pkg, join(root, '.dsh')));
    expect(existsSync(join(stale, 'pnpm-workspace.yaml'))).toBe(false);
    expect(readFileSync(join(stale, '.npmrc'), 'utf8')).toBe('@jackwener:registry=https://registry.npmjs.org/\n');
    expect(JSON.parse(readFileSync(join(paths.opencliRoot, 'toolchain', 'package.json'), 'utf8'))).toEqual({
      name: 'dsh-workbench-toolchain',
      private: true,
      dependencies: { '@jackwener/opencli': expect.any(String) },
    });
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

    expect(done).toContain(paths.opencliBin);
    expect(done).toContain(join(paths.opencliRoot, 'toolchain', 'package.json'));
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

describePosix('DSH_WB_PNPM 是命令前缀，路径不许被 shell 拆词', () => {
  it('★ Desktop 里装好的本地 pnpm 路径整段带引号（工作台根带空格也不拆词）', async () => {
    const root = join(tempRoot(), 'work bench');
    vi.stubEnv('PATH', process.env.PATH ?? '');
    vi.stubEnv('DSH_WB_PNPM', '');
    const bin = localPnpmBin(root);
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'pnpm'), '', 'utf8');
    Object.defineProperty(process.versions, 'electron', { value: '44.7.0', configurable: true, writable: true });
    try {
      await seedWorkbenchToolchain(root, () => undefined, undefined, 'linux');
    } finally {
      delete (process.versions as { electron?: string }).electron;
    }

    const command = quoteShellArgFor(localPnpmCommand(root, 'linux'), 'linux');
    expect(process.env.DSH_WB_PNPM).toBe(command);
    expect(command.startsWith("'")).toBe(true);
    expect(command.endsWith("'")).toBe(true);
    expect(command).toContain(root);
  });
});
