import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  desktopNodeShim,
  ensureToolchain,
  localNpmBin,
  localNpmCache,
  localNpmInstallCommand,
  LOCAL_NPM_VERSION,
  localPnpmBin,
  localPnpmInstallCommand,
  LOCAL_PNPM_VERSION,
  provisionLocalNpm,
  provisionLocalPnpm,
  provisionLocalPnpmSync,
  toolchainBinDir,
} from '../toolchain';

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-toolchain-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const desktop = { versions: { electron: '44.7.0', node: '24.15.0' }, execPath: '/Applications/Test.app/Contents/MacOS/Test' };
const web = { versions: { node: '24.15.0' }, execPath: '/usr/local/bin/node' };

describe('desktopNodeShim', () => {
  it('★ Desktop 用 Electron 的 Node 模式跑同一个 runtime；web 不生成', () => {
    const shim = desktopNodeShim(desktop, 'darwin');
    expect(shim).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(shim).toContain('/Applications/Test.app/Contents/MacOS/Test');
    expect(desktopNodeShim(web, 'darwin')).toBeUndefined();
  });

  it('Windows 的 shim 是 .cmd 形状，不写 sh', () => {
    const shim = desktopNodeShim(desktop, 'win32');
    expect(shim).toContain('@echo off');
    expect(shim).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(shim).not.toContain('#!/bin/sh');
  });

  it('★ Desktop 自带真 Node 时直接 exec 它：Electron 会把子进程注册成第二个 app 实例（Dock 里第二个图标）', () => {
    const resourcesPath = '/Applications/Test.app/Contents/Resources';
    const nodeBin = `${resourcesPath}/runtime/primary-runtime/dependencies/node/bin/node`;
    const proc = { ...desktop, resourcesPath };

    const shim = desktopNodeShim(proc, 'darwin', (path) => path === nodeBin);
    expect(shim).toContain(`exec '${nodeBin}' "$@"`);
    expect(shim).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(shim).not.toContain('/Applications/Test.app/Contents/MacOS/Test');

    const windows = desktopNodeShim(proc, 'win32', (path) => path === `${nodeBin}.exe`);
    expect(windows).toContain('@echo off');
    expect(windows).toContain('node.exe');
    expect(windows).not.toContain('ELECTRON_RUN_AS_NODE');
  });
});

describe('ensureToolchain', () => {
  it('★ web 不写 shim，也不返回要前插的目录', () => {
    const root = tempRoot();
    expect(ensureToolchain({ root, proc: web, platform: 'darwin' })).toEqual({ files: [] });
  });

  it('★ Desktop 幂等写 node shim，并返回专属 bin 目录', () => {
    const root = tempRoot();
    const first = ensureToolchain({ root, proc: desktop, platform: 'darwin' });
    expect(first.pathDir).toBe(toolchainBinDir(root));
    expect(first.files).toHaveLength(1);
    const file = join(first.pathDir ?? '', 'node');
    expect(readFileSync(file, 'utf8')).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(statSync(file).mode & 0o777).toBe(0o755);

    expect(ensureToolchain({ root, proc: desktop, platform: 'darwin' }).files).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('★ 写出来的 shim 真能执行 --version', () => {
    const root = tempRoot();
    const proc = { versions: { electron: '44.7.0', node: '24.15.0' }, execPath: process.execPath };
    const result = ensureToolchain({ root, proc, platform: 'darwin' });
    const file = join(result.pathDir ?? '', 'node');

    const stdout = execFileSync(file, ['--version'], { encoding: 'utf8' });
    expect(stdout.trim()).toMatch(/^v\d+\./);
  });
});

const resources = '/Applications/Test.app/Contents/Resources';
const pnpmCjs = `${resources}/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs`;
const desktopPnpm = { versions: { electron: '44.7.0', node: '24.15.0' }, resourcesPath: resources };

describe('本地 npm', () => {
  it('★ Desktop 有 bundled pnpm → 装 npm@10.9.4 到工作台目录', () => {
    const root = tempRoot();
    const command = localNpmInstallCommand(root, desktopPnpm, (path) => path === pnpmCjs);

    expect(command).toContain(pnpmCjs);
    expect(command).toContain(`add --dir '${join(root, 'npm')}'`);
    expect(command).toContain(`npm@${LOCAL_NPM_VERSION}`);
    expect(command).toContain(`--store-dir '${join(root, 'npm-store')}'`);
    expect(localNpmCache(root)).toBe(join(root, 'npm-cache'));
  });

  it('★ win32 用双引号包路径，不再发 POSIX 单引号', () => {
    const root = tempRoot();
    const command = localNpmInstallCommand(root, desktopPnpm, (path) => path === pnpmCjs, 'win32');

    expect(command).toContain(`"${pnpmCjs}"`);
    expect(command).toContain(`--dir "${join(root, 'npm')}"`);
    expect(command).toContain(`--store-dir "${join(root, 'npm-store')}"`);
    expect(command).not.toContain(`'${pnpmCjs}'`);
  });

  it('web 不生成本地 npm 命令', () => {
    expect(localNpmInstallCommand(tempRoot(), web, () => true)).toBeUndefined();
  });

  it('★ provision 成功 → 返回 bin 目录；命令真发出去一次', async () => {
    const root = tempRoot();
    const commands: string[] = [];
    const result = await provisionLocalNpm({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      installed: () => true,
      run: async (command) => {
        commands.push(command);
        return { ok: true, detail: '' };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.binDir).toBe(localNpmBin(root));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(`npm@${LOCAL_NPM_VERSION}`);
  });

  it('provision 失败保留原因，不假装装好', async () => {
    const root = tempRoot();
    const result = await provisionLocalNpm({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      run: async () => ({ ok: false, detail: 'network down' }),
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('network down');
  });

  it('★ 全新工作台（目标目录还不存在）先建目录再装 —— `pnpm add --dir` 不自己建（真机 ENOENT）', async () => {
    const root = tempRoot();
    let dirAtRun = false;
    const result = await provisionLocalNpm({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      installed: () => true,
      run: async () => {
        dirAtRun = existsSync(join(root, 'npm'));
        return { ok: true, detail: '' };
      },
    });

    expect(dirAtRun).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('已装好本地 npm 时，ensureToolchain 把它的 bin 一起返回', () => {
    const root = tempRoot();
    const bin = localNpmBin(root);
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'npm'), '', 'utf8');

    const result = ensureToolchain({ root, proc: desktop, platform: 'darwin' });
    const again = ensureToolchain({ root, proc: desktop, platform: 'darwin' });

    expect(result.npmDir).toBe(bin);
    expect(again.npmDir).toBe(bin);
    expect(again.files).toEqual([]);
  });
});

describe('本地 pnpm 10', () => {
  it('★ Desktop 有 bundled pnpm → 装 pnpm@10.32.1 到工作台目录', () => {
    const root = tempRoot();
    const command = localPnpmInstallCommand(root, desktopPnpm, (path) => path === pnpmCjs);

    expect(command).toContain(pnpmCjs);
    expect(command).toContain(`add --dir '${join(root, 'pnpm-10')}'`);
    expect(command).toContain(`pnpm@${LOCAL_PNPM_VERSION}`);
    expect(command).toContain(`--store-dir '${join(root, 'pnpm-store')}'`);
  });

  it('★ win32 的 pnpm 安装命令也用双引号', () => {
    const root = tempRoot();
    const command = localPnpmInstallCommand(root, desktopPnpm, (path) => path === pnpmCjs, 'win32');

    expect(command).toContain(`"${pnpmCjs}"`);
    expect(command).toContain(`--dir "${join(root, 'pnpm-10')}"`);
    expect(command).toContain(`--store-dir "${join(root, 'pnpm-store')}"`);
  });

  it('web 不生成本地 pnpm 命令', () => {
    expect(localPnpmInstallCommand(tempRoot(), web, () => true)).toBeUndefined();
  });

  it('★ provision 成功 → 返回 bin 目录', async () => {
    const root = tempRoot();
    const commands: string[] = [];
    const result = await provisionLocalPnpm({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      installed: () => true,
      run: async (command) => {
        commands.push(command);
        return { ok: true, detail: '' };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.binDir).toBe(localPnpmBin(root));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(`pnpm@${LOCAL_PNPM_VERSION}`);
  });

  it('★ 同步 provision 也走同一条命令（启动时 seed 之前用）', () => {
    const root = tempRoot();
    const commands: string[] = [];
    const result = provisionLocalPnpmSync({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      installed: () => true,
      run: (command) => commands.push(command),
    });

    expect(result.ok).toBe(true);
    expect(result.binDir).toBe(localPnpmBin(root));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(`pnpm@${LOCAL_PNPM_VERSION}`);
  });

  it('provision 失败保留原因', async () => {
    const root = tempRoot();
    const result = await provisionLocalPnpm({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      run: async () => ({ ok: false, detail: 'network down' }),
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('network down');
  });

  it('★ 全新工作台（目标目录还不存在）先建目录再装 —— `pnpm add --dir` 不自己建（真机 ENOENT）', async () => {
    const root = tempRoot();
    let dirAtRun = false;
    const result = await provisionLocalPnpm({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      installed: () => true,
      run: async () => {
        dirAtRun = existsSync(join(root, 'pnpm-10'));
        return { ok: true, detail: '' };
      },
    });

    expect(dirAtRun).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('★ 启动时那条同步 provision 也一样先建目录（工坊 seed 之前跑的就是它）', () => {
    const root = tempRoot();
    let dirAtRun = false;
    const result = provisionLocalPnpmSync({
      root,
      proc: desktopPnpm,
      exists: (path) => path === pnpmCjs,
      installed: () => true,
      run: () => {
        dirAtRun = existsSync(join(root, 'pnpm-10'));
      },
    });

    expect(dirAtRun).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('已装好本地 pnpm 10 时，ensureToolchain 把它的 bin 一起返回', () => {
    const root = tempRoot();
    const bin = localPnpmBin(root);
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'pnpm'), '', 'utf8');

    const result = ensureToolchain({ root, proc: desktop, platform: 'darwin' });

    expect(result.pnpmDir).toBe(bin);
  });
});
