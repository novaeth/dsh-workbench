import { describe, expect, it, vi } from 'vitest';
import type { DshShell, DshShellExecution } from '@dsh-workbench/shared';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createPreflight, probeDesktopToolchain } from '../index.js';
import { ALL_OK } from './preflight-fixtures';

function hangingShell(): DshShell {
  return {
    resolve: (request) => request,
    execute: () => new Promise<DshShellExecution>(() => {}),
  };
}

describe('Desktop 工具链步骤', () => {
  it('★ 命令没返回 → 报 stalled，不把"没装"三个字安到 node 头上', async () => {
    vi.useFakeTimers();
    try {
      const pending = probeDesktopToolchain(hangingShell());
      await vi.advanceTimersByTimeAsync(11_000);
      const report = await pending;

      expect(report.stalled).toBe(true);
      expect(report.ok).toBe(false);
      expect(report.nodeMissing).toBe(false);
      expect(report.detail).toContain('没有返回');
      expect(report.detail).not.toContain('不在 PATH');
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 真实探测：node 好、npm 缺、pnpm 11 → warn 的理由分开说', async () => {
    const fake = createFakeShell([
      { stdout: 'v24.21.0\n' },
      { exitCode: 127, stderr: 'npm: command not found\n' },
      { stdout: '11.28.5\n' },
    ]);
    const report = await probeDesktopToolchain(fake.shell);

    expect(report.ok).toBe(true);
    expect(report.nodeMissing).toBe(false);
    expect(report.npmMissing).toBe(true);
    expect(report.pnpmProblem).toBe(true);
    expect(report.detail).toContain('node v24.21.0');
    expect(report.detail).toContain('npm 缺');
    expect(report.detail).toContain('pnpm 11.28.5');
  });

  it('★ node 好、npm/pnpm 缺 → toolchain=warn，仍放行 opencli', async () => {
    const fake = createFakeShell(ALL_OK);
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => ({
        ok: true,
        detail: 'node v24.21.0（Desktop 自带）· npm 缺（只影响 opencli 安装/插件安装）· pnpm 缺（只影响工坊 build/install）',
        nodeMissing: false,
        npmMissing: true,
        pnpmProblem: true,
      }),
    });

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps.map((item) => `${item.id}=${item.status}`)).toEqual([
      'toolchain=warn',
      'cli=ok',
      'bridge=ok',
    ]);
    expect(snapshot.steps[0]?.detail).toContain('npm 缺');
    expect(fake.calls.map((call) => call.command)).toEqual(['opencli --version', 'opencli doctor']);
  });

  it('★ node 缺 → toolchain=failed，一条 opencli 命令都不发', async () => {
    const fake = createFakeShell(ALL_OK);
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => ({
        ok: false,
        detail: 'node 不在 PATH（Desktop 自带 Node 的 shim 没生效）',
        nodeMissing: true,
        npmMissing: true,
        pnpmProblem: true,
      }),
    });

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('failed');
    expect(snapshot.steps.find((step) => step.id === 'toolchain')?.status).toBe('failed');
    expect(fake.calls).toHaveLength(0);
  });

  it('★ 命令没返回 → 停住并走 host 那档：一条 opencli 命令不发，也不提"装 Node"', async () => {
    const fake = createFakeShell(ALL_OK);
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => ({
        ok: false,
        detail: '版本探测没有返回：node / npm / pnpm 的命令都没把结果交回来（不是没装）',
        nodeMissing: false,
        npmMissing: false,
        pnpmProblem: false,
        stalled: true,
      }),
    });

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('failed');
    expect(snapshot.failure).toBe('host');
    expect(snapshot.guidance).toBe('host');
    expect(snapshot.steps.find((step) => step.id === 'toolchain')?.status).toBe('failed');
    expect(fake.calls).toHaveLength(0);
  });

  it('★ npm 缺 → 先 provision 本地 npm，再复探一次', async () => {
    const fake = createFakeShell(ALL_OK);
    let probes = 0;
    const provision = vi.fn(async () => ({ ok: true, binDir: '/tmp/npm-bin', detail: 'npm@10.9.4' }));
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => {
        probes += 1;
        return probes === 1
          ? { ok: true, detail: 'node v24 · npm 缺', nodeMissing: false, npmMissing: true, pnpmProblem: false }
          : { ok: true, detail: 'node v24 · npm 10.9.4', nodeMissing: false, npmMissing: false, pnpmProblem: false };
      },
      provisionNpm: provision,
    });

    const snapshot = await preflight.run();

    expect(provision).toHaveBeenCalledTimes(1);
    expect(probes).toBe(2);
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[0]?.status).toBe('ok');
    expect(snapshot.steps[0]?.detail).toContain('npm 10.9.4');
  });

  it('★ provision 失败 → 仍放行 opencli，但把原因留在 toolchain 里', async () => {
    const fake = createFakeShell(ALL_OK);
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => ({
        ok: true,
        detail: 'node v24 · npm 缺',
        nodeMissing: false,
        npmMissing: true,
        pnpmProblem: false,
      }),
      provisionNpm: async () => ({ ok: false, detail: '网络不可用' }),
    });

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[0]?.status).toBe('warn');
    expect(snapshot.steps[0]?.detail).toContain('本地 npm 没装成：网络不可用');
  });

  it('★ npm 已存在 → 一次 provision 都不跑', async () => {
    const fake = createFakeShell(ALL_OK);
    const provision = vi.fn(async () => ({ ok: true, detail: 'should not run' }));
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => ({
        ok: true,
        detail: 'node v24 · npm 10.9.4',
        nodeMissing: false,
        npmMissing: false,
        pnpmProblem: false,
      }),
      provisionNpm: provision,
    });

    await preflight.run();

    expect(provision).not.toHaveBeenCalled();
  });

  it('★ pnpm 11 → 先 provision 本地 pnpm 10，再复探一次', async () => {
    const fake = createFakeShell(ALL_OK);
    let probes = 0;
    const provision = vi.fn(async () => ({ ok: true, binDir: '/tmp/pnpm-bin', detail: 'pnpm@10.32.1' }));
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => {
        probes += 1;
        return probes === 1
          ? { ok: true, detail: 'node v24 · pnpm 11', nodeMissing: false, npmMissing: false, pnpmProblem: true }
          : { ok: true, detail: 'node v24 · pnpm 10.32.1', nodeMissing: false, npmMissing: false, pnpmProblem: false };
      },
      provisionPnpm: provision,
    });

    const snapshot = await preflight.run();

    expect(provision).toHaveBeenCalledTimes(1);
    expect(probes).toBe(2);
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[0]?.status).toBe('ok');
    expect(snapshot.steps[0]?.detail).toContain('pnpm 10.32.1');
  });

  it('★ pnpm provision 失败 → 仍放行 opencli，原因留在 toolchain 里', async () => {
    const fake = createFakeShell(ALL_OK);
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => ({
        ok: true,
        detail: 'node v24 · pnpm 11',
        nodeMissing: false,
        npmMissing: false,
        pnpmProblem: true,
      }),
      provisionPnpm: async () => ({ ok: false, detail: '网络不可用' }),
    });

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[0]?.status).toBe('warn');
    expect(snapshot.steps[0]?.detail).toContain('本地 pnpm 10 没装成：网络不可用');
  });

  it('★ pnpm 10 已存在 → 不 provision', async () => {
    const fake = createFakeShell(ALL_OK);
    const provision = vi.fn(async () => ({ ok: true, detail: 'should not run' }));
    const preflight = createPreflight({
      shell: fake.shell,
      probeToolchain: async () => ({
        ok: true,
        detail: 'node v24 · pnpm 10.32.1',
        nodeMissing: false,
        npmMissing: false,
        pnpmProblem: false,
      }),
      provisionPnpm: provision,
    });

    await preflight.run();

    expect(provision).not.toHaveBeenCalled();
  });
});
