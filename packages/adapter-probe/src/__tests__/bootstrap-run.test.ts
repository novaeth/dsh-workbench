import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSeam, type Seam } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell, type FakeProcessReply } from '@dsh-workbench/shared/testing';
import { bootstrapEnv, runBootstrapCommand, type BootstrapSpawn } from '../bootstrap-run.js';
import { installIsolatedRuntime } from '../isolated-install.js';

const PNPM_STORE_ERROR = ` ERR_PNPM_UNEXPECTED_STORE  Unexpected store location

The dependencies at "/private/tmp/p5/node_modules" are currently linked from the store at "/tmp/sA/v10".

pnpm now wants to use the store at "/tmp/sB/v10" to link dependencies.

If you want to use the new store location, reinstall your dependencies with "pnpm install".

You may change the global store location by running "pnpm config set store-dir <dir> --global".
(This error may happen if the node_modules was installed with a different major version of pnpm)`;

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'wb-bootstrap-'));
}

function seamWith(replies: FakeProcessReply[] = [{}]): {
  seam: Seam;
  processes: ReturnType<typeof createFakeProcesses>;
} {
  const processes = createFakeProcesses(replies);
  const seam = createSeam({
    shell: createFakeShell([{}]).shell,
    runtimeRoot: '/tmp/wb-seam-test',
    allowHost: true,
    processes: processes.host,
  });
  return { seam, processes };
}

describe('bootstrapEnv（自举命令的环境）', () => {
  it('★ HOME 与缓存钉进隔离运行时；用户 npmrc 仍从真家目录读', () => {
    const realHome = tempHome();
    writeFileSync(join(realHome, '.npmrc'), 'registry=https://example.invalid/');
    try {
      const env = bootstrapEnv({
        opencliRoot: '/workbench/opencli',
        realHome,
        parent: { PATH: '/bin', HOME: '/real-home' },
        shellKind: 'posix',
      });
      expect(env['HOME']).toBe('/workbench/opencli/home');
      expect(env['npm_config_cache']).toBe('/workbench/opencli/npm-cache');
      expect(env['NPM_CONFIG_CACHE']).toBe('/workbench/opencli/npm-cache');
      expect(env['NPM_CONFIG_USERCONFIG']).toBe(join(realHome, '.npmrc'));
      expect(env['PATH']).toBe('/bin');
      expect(env['USERPROFILE']).toBeUndefined();
    } finally {
      rmSync(realHome, { recursive: true, force: true });
    }
  });

  it('真家目录没有 .npmrc 时不设用户配置；Windows 同时钉 USERPROFILE', () => {
    const realHome = tempHome();
    try {
      const env = bootstrapEnv({ opencliRoot: '/wb/opencli', realHome, parent: {}, shellKind: 'pwsh' });
      expect(env['NPM_CONFIG_USERCONFIG']).toBeUndefined();
      expect(env['USERPROFILE']).toBe('/wb/opencli/home');
    } finally {
      rmSync(realHome, { recursive: true, force: true });
    }
  });
});

describe('runBootstrapCommand（自举命令走宿主域）', () => {
  it('★ POSIX 是 bash -c，Windows 是 pwsh -Command（不经沙箱）', async () => {
    const { seam, processes } = seamWith([{}, {}]);

    await runBootstrapCommand('pnpm add --dir /x', { timeoutMs: 1000, shellKind: 'posix', seam });
    await runBootstrapCommand('pnpm add --dir /x', { timeoutMs: 1000, shellKind: 'pwsh', seam });

    expect(processes.calls[0]?.file).toBe('bash');
    expect(processes.calls[0]?.args).toEqual(['-c', 'pnpm add --dir /x']);
    expect(processes.calls[0]?.detached).toBe(false);
    expect(processes.calls[1]?.file).toBe('pwsh');
    expect(processes.calls[1]?.args).toEqual(['-NoProfile', '-NonInteractive', '-Command', 'pnpm add --dir /x']);
    expect(seam.facts().filter((fact) => fact.verb === 'run')).toHaveLength(2);
  });

  it('非零退出 → ok:false，带 stderr 尾部', async () => {
    const { seam } = seamWith([{ exitCode: 2, stderr: 'a\nb\nEPERM: nope\n' }]);

    const result = await runBootstrapCommand('cmd', { timeoutMs: 1, seam });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('EPERM: nope');
  });

  it('★ 非零退出保留首行：pnpm 的 ERR_PNPM_UNEXPECTED_STORE 不被尾部截掉', async () => {
    const spawn: BootstrapSpawn = async () => ({ exitCode: 1, stdout: '', stderr: PNPM_STORE_ERROR });

    const result = await runBootstrapCommand('pnpm add --dir /x', { timeoutMs: 1000, shellKind: 'posix', spawn });

    expect(result.ok).toBe(false);
    expect(result.detail.split('\n')[0]).toBe('ERR_PNPM_UNEXPECTED_STORE  Unexpected store location');
    expect(result.detail).toContain('ERR_PNPM_UNEXPECTED_STORE');
    expect(result.detail).toContain('different major version of pnpm');
  });

  it('失败输出没被截掉时不重复首行', async () => {
    const spawn: BootstrapSpawn = async () => ({ exitCode: 3, stdout: '', stderr: 'one\ntwo\nthree\n' });

    const result = await runBootstrapCommand('cmd', { timeoutMs: 1000, shellKind: 'posix', spawn });

    expect(result.detail).toBe('one\ntwo\nthree');
  });

  it('★ 真实 pnpm store 报错串到 installIsolatedRuntime：清掉装了一半的 node_modules 再跑一遍', async () => {
    let attempts = 0;
    const live = join(tempHome(), 'toolchain');
    const run = vi.fn(async () => {
      attempts += 1;
      return runBootstrapCommand('pnpm add --dir /x', {
        timeoutMs: 1000,
        shellKind: 'posix',
        spawn: async () =>
          attempts === 1
            ? { exitCode: 1, stdout: '', stderr: PNPM_STORE_ERROR }
            : { exitCode: 0, stdout: '+ @jackwener/opencli 1.2.1\n', stderr: '' },
      });
    });

    const result = await installIsolatedRuntime({
      liveDir: live,
      command: () => 'pnpm add --dir /x',
      run,
      ready: () => attempts >= 2,
      describe: () => '',
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(true);
    expect(result.detail).toContain('装了一半的 node_modules');
    expect(existsSync(join(live, 'package.json'))).toBe(true);
  });

  it('超时 → ok:false 且提示超时', async () => {
    const { seam } = seamWith([{ hang: true }]);

    const result = await runBootstrapCommand('cmd', { timeoutMs: 20, seam });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('超时');
  });

  it('命令起不来 → ok:false，说清起不来', async () => {
    const { seam } = seamWith([{ error: new Error('spawn bash ENOENT') }]);

    const result = await runBootstrapCommand('cmd --x', { timeoutMs: 1000, seam });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('ENOENT');
  });

  it('没有执行缝 → ok:false，不假装跑过', async () => {
    const result = await runBootstrapCommand('cmd --x', { timeoutMs: 1 });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('cmd --x');
  });

  it('★ 自举环境传给宿主进程，调用方 env 盖在上面', async () => {
    const { seam, processes } = seamWith([{}]);

    await runBootstrapCommand('cmd', { timeoutMs: 1, seam, env: { DSH_WB_PNPM: 'node pnpm.cjs' } });

    expect(processes.calls[0]?.env['DSH_WB_PNPM']).toBe('node pnpm.cjs');
    expect(String(processes.calls[0]?.env['HOME'])).toContain('opencli');
  });

  it('自举命令的注入口仍可给测试（spawn 抛错 → ok:false 带命令原文）', async () => {
    const spawn: BootstrapSpawn = async () => {
      throw new Error('spawn bash ENOENT');
    };
    const result = await runBootstrapCommand('cmd --x', { timeoutMs: 1, spawn });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('cmd --x');
  });
});
