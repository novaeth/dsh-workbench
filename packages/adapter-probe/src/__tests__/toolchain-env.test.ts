import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  desktopBundledBins,
  desktopNodeExecutable,
  desktopResourcesDir,
  desktopRuntimeEnv,
  desktopRuntimeEnvPath,
} from '../index.js';

const resources = join('/opt', 'DeepSeek Harness', 'resources');
const dependencies = join(resources, 'runtime', 'primary-runtime', 'dependencies');
const nodeBin = join(dependencies, 'node', 'bin');
const pnpmBin = join(dependencies, 'pnpm', 'bin');
const proc = { versions: { electron: '31.0.0' }, execPath: join(resources, 'app.asar'), resourcesPath: resources };
const existsIn = (paths: readonly string[]) => (path: string) => paths.includes(path);

describe('Desktop 自带工具链的 PATH', () => {
  it('★ 找得到自带 node/pnpm 的 bin（Windows 宿主没把 node 放上 PATH 时靠它）', () => {
    expect(desktopBundledBins(proc, existsIn([nodeBin, pnpmBin]))).toEqual([nodeBin, pnpmBin]);
  });

  it('★ 只带了一份就只认那一份', () => {
    expect(desktopBundledBins(proc, existsIn([nodeBin]))).toEqual([nodeBin]);
    expect(desktopBundledBins(proc, existsIn([]))).toEqual([]);
  });

  it('★ 拼 PATH 时自带 bin 排最前，原来的重复项去掉', () => {
    const path = desktopRuntimeEnvPath(`${nodeBin}:/usr/bin`, proc, existsIn([nodeBin, pnpmBin]), ':');
    expect(path).toBe([nodeBin, pnpmBin, '/usr/bin'].join(':'));
  });

  it('★ 找得到自带 node 可执行文件（Windows 上 PATH 没它也能直接调）', () => {
    const nodeExe = join(nodeBin, process.platform === 'win32' ? 'node.exe' : 'node');
    expect(desktopNodeExecutable(proc, existsIn([nodeExe]))).toBe(nodeExe);
    expect(desktopNodeExecutable(proc, existsIn([]))).toBeUndefined();
  });

  it('★ resourcesPath 由桌面包自己给；没给就不猜路径', () => {
    expect(desktopResourcesDir(proc)).toBe(resources);
    expect(desktopResourcesDir({ versions: { electron: '31.0.0' }, execPath: join(resources, 'app.asar'), resourcesPath: '' })).toBeUndefined();
    expect(desktopResourcesDir({ versions: {}, execPath: '/usr/bin/node' })).toBeUndefined();
  });

  it('★ 交给 shell 的 env 要带全父进程变量，只把 PATH 换成带自带 bin 的那份', () => {
    const env = desktopRuntimeEnv({ PATH: '/usr/bin', HOME: '/home/u', TERM: 'xterm' }, proc, existsIn([nodeBin, pnpmBin]));
    expect(env['PATH']).toBe([nodeBin, pnpmBin, '/usr/bin'].join(':'));
    expect(env['HOME']).toBe('/home/u');
    expect(env['TERM']).toBe('xterm');
    expect(desktopRuntimeEnv({ PATH: '/usr/bin' }, { versions: {}, execPath: '/usr/bin/node' }, existsIn([nodeBin]))).toEqual({});
  });

  it('★ 不是 Desktop（web 部署）就不动 PATH', () => {
    const web = { versions: {}, execPath: '/usr/bin/node' };
    expect(desktopRuntimeEnvPath('/usr/bin', web, existsIn([nodeBin]), ':')).toBeUndefined();
  });
});
