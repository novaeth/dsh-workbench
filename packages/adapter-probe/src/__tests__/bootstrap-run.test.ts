import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootstrapEnv, runBootstrapCommand, type BootstrapSpawn } from '../bootstrap-run.js';

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'wb-bootstrap-'));
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

describe('runBootstrapCommand（出缝的自举命令）', () => {
  it('★ 不经过执行缝：POSIX 用 bash -c，Windows 用 pwsh -Command', async () => {
    const calls: { file: string; args: readonly string[]; reject: boolean }[] = [];
    const spawn: BootstrapSpawn = async (file, args, options) => {
      calls.push({ file, args, reject: options.reject });
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    };
    await runBootstrapCommand('pnpm add --dir /x', { timeoutMs: 1000, shellKind: 'posix', spawn });
    await runBootstrapCommand('pnpm add --dir /x', { timeoutMs: 1000, shellKind: 'pwsh', spawn });
    expect(calls[0]?.file).toBe('bash');
    expect(calls[0]?.args).toEqual(['-c', 'pnpm add --dir /x']);
    expect(calls[1]?.file).toBe('pwsh');
    expect(calls[1]?.args).toEqual(['-NoProfile', '-NonInteractive', '-Command', 'pnpm add --dir /x']);
    expect(calls[0]?.reject).toBe(false);
  });

  it('非零退出 → ok:false，带 stderr 尾部', async () => {
    const spawn: BootstrapSpawn = async () => ({ exitCode: 2, stdout: '', stderr: 'a\nb\nEPERM: nope\n' });
    const result = await runBootstrapCommand('cmd', { timeoutMs: 1, spawn });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('EPERM: nope');
  });

  it('超时 → ok:false 且提示超时', async () => {
    const spawn: BootstrapSpawn = async () => ({ exitCode: null, timedOut: true, stdout: '', stderr: '' });
    const result = await runBootstrapCommand('cmd', { timeoutMs: 50, spawn });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('超时');
  });

  it('spawn 抛错 → ok:false，带命令原文', async () => {
    const spawn: BootstrapSpawn = async () => {
      throw new Error('spawn bash ENOENT');
    };
    const result = await runBootstrapCommand('cmd --x', { timeoutMs: 1, spawn });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('cmd --x');
  });

  it('调用方 env 覆盖在自举环境之上', async () => {
    let seen: Record<string, string> = {};
    const spawn: BootstrapSpawn = async (_file, _args, options) => {
      seen = { ...options.env };
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    await runBootstrapCommand('cmd', { timeoutMs: 1, spawn, env: { DSH_WB_PNPM: 'node pnpm.cjs' } });
    expect(seen['DSH_WB_PNPM']).toBe('node pnpm.cjs');
    expect(seen['HOME']).toContain('opencli');
  });
});
