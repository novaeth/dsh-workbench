import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SeamError } from '../seam/intent.js';
import { createSeam } from '../seam/run.js';
import { createUnitSeam, unitDataRoot } from '../seam/unit-seam.js';
import { createFakeShell, createFakeLogger } from '../../testing/host-fakes.js';

const ROOT = join(tmpdir(), 'dsh-wb-seam-root');
const PROJECT = join(tmpdir(), 'dsh-wb-seam-project');
const SCRATCH = mkdtempSync(join(tmpdir(), 'dsh-wb-seam-'));
const REAL_HOME = join(SCRATCH, 'home');

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

function policyOf(call: { sandboxPolicy?: unknown } | undefined): unknown {
  return call?.sandboxPolicy;
}

describe('createSeam', () => {
  it('产品域：固定根 + 注入产品环境', async () => {
    const fake = createFakeShell([{}]);
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT, realHome: REAL_HOME });
    const outcome = await seam.run({ command: 'npm view left-pad version', intent: { kind: 'product' } });
    expect(outcome.exitCode).toBe(0);
    expect(policyOf(fake.calls[0])).toEqual({ mode: 'workspace-write', workspaceRoot: ROOT });
    const env = fake.calls[0]?.env;
    expect(env?.['HOME']).toBe(join(ROOT, 'home'));
    expect(env?.['npm_config_cache']).toBe(join(ROOT, 'npm-cache'));
    expect(env?.['DSH_WORKBENCH_HOME']).toBe(ROOT);
    expect(env?.['npm_config_state_dir']).toBe(join(ROOT, 'pnpm-state'));
  });

  it('产品域不跟会话只读，只跟部署上限', async () => {
    const fake = createFakeShell([{}]);
    const seam = createSeam({
      shell: fake.shell,
      runtimeRoot: ROOT,
      ceiling: 'workspace-write',
      grantOf: () => ({ mode: 'read-only', workspaceRoot: PROJECT }),
    });
    await seam.run({ command: 'npm view x version', intent: { kind: 'product' } });
    expect(policyOf(fake.calls[0])).toEqual({ mode: 'workspace-write', workspaceRoot: ROOT });
  });

  it('工作区域：取会话解析结果；上限更宽时按会话', async () => {
    const fake = createFakeShell([{}]);
    const seam = createSeam({
      shell: fake.shell,
      runtimeRoot: ROOT,
      ceiling: 'danger-full-access',
      grantOf: () => ({ mode: 'danger-full-access', workspaceRoot: PROJECT }),
    });
    await seam.run({ command: 'pnpm install', intent: { kind: 'workspace' }, session: {} });
    expect(policyOf(fake.calls[0])).toEqual({ mode: 'danger-full-access', workspaceRoot: PROJECT });
  });

  it('会话只读：起进程前就拒绝，不起进程', async () => {
    const fake = createFakeShell([{}]);
    const seam = createSeam({
      shell: fake.shell,
      runtimeRoot: ROOT,
      grantOf: () => ({ mode: 'read-only', workspaceRoot: PROJECT }),
    });
    await expect(seam.run({ command: 'pnpm install', intent: { kind: 'workspace' }, session: {} })).rejects.toMatchObject({
      code: 'read-only',
    });
    expect(fake.calls).toHaveLength(0);
  });

  it('没有会话却要写工作区：起进程前报 workspace-unknown', async () => {
    const fake = createFakeShell([{}]);
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });
    await expect(seam.run({ command: 'pnpm install', intent: { kind: 'workspace' } })).rejects.toMatchObject({
      code: 'workspace-unknown',
    });
    expect(fake.calls).toHaveLength(0);
  });

  it('外部路径：同一目录可以，跨目录拒绝', async () => {
    const fake = createFakeShell([{}]);
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });
    await seam.run({ command: 'png', intent: { kind: 'paths', paths: [join(SCRATCH, 'a.png'), join(SCRATCH, 'b.png')] } });
    expect(policyOf(fake.calls[0])).toEqual({ mode: 'workspace-write', workspaceRoot: SCRATCH });
    await expect(
      seam.run({ command: 'png', intent: { kind: 'paths', paths: [join(SCRATCH, 'a.png'), '/etc/hosts'] } }),
    ).rejects.toMatchObject({ code: 'paths-span-trees' });
    expect(fake.calls).toHaveLength(1);
  });

  it('安全重试：产品域被拒后按产品域重跑一次并标记 healed', async () => {
    const fake = createFakeShell([
      {
        exitCode: 1,
        stderr: "npm error code EPERM\nnpm error path " + join(ROOT, 'npm-cache', '_cacache') + "\n",
        sandbox: { mode: 'workspace-write', denied: true },
      },
      {},
    ]);
    const seam = createSeam({
      shell: fake.shell,
      runtimeRoot: ROOT,
      grantOf: () => ({ mode: 'workspace-write', workspaceRoot: PROJECT }),
    });
    const outcome = await seam.run({
      command: 'npm publish',
      intent: { kind: 'workspace' },
      session: {},
      retry: 'safe',
    });
    expect(fake.calls).toHaveLength(2);
    expect(policyOf(fake.calls[1])).toEqual({ mode: 'workspace-write', workspaceRoot: ROOT });
    expect(outcome.denial?.healed).toBe(true);
    expect(outcome.denial?.scope).toBe('product');
  });

  it('写命令默认不自动重试：denial 直接给类型化错误', async () => {
    const fake = createFakeShell([
      {
        exitCode: 1,
        stderr: "EPERM: operation not permitted, mkdir '" + join(ROOT, 'npm-cache') + "'\n",
        sandbox: { mode: 'workspace-write', denied: true },
      },
    ]);
    const seam = createSeam({
      shell: fake.shell,
      runtimeRoot: ROOT,
      grantOf: () => ({ mode: 'workspace-write', workspaceRoot: PROJECT }),
    });
    await expect(
      seam.run({ command: 'git commit', intent: { kind: 'workspace' }, session: {} }),
    ).rejects.toMatchObject({ code: 'sandbox-denied' });
    expect(fake.calls).toHaveLength(1);
  });

  it('外部路径被拒：bestEffort 返回带 denial 的结果，否则抛类型化错误', async () => {
    const external = join(tmpdir(), 'dsh-wb-seam-external', 'shot.png');
    const denialReply = {
      exitCode: 1,
      stderr: "EPERM: operation not permitted, open '" + external + "'\n",
      sandbox: { mode: 'workspace-write', denied: true },
    };
    const best = createFakeShell([denialReply]);
    const seamBest = createSeam({ shell: best.shell, runtimeRoot: ROOT, logger: createFakeLogger().logger });
    const outcome = await seamBest.run({ command: 'png', intent: { kind: 'product' }, bestEffort: true });
    expect(outcome.denial?.scope).toBe('external');
    expect(outcome.denial?.path).toBe(external);

    const strict = createFakeShell([denialReply]);
    const seamStrict = createSeam({ shell: strict.shell, runtimeRoot: ROOT });
    await expect(seamStrict.run({ command: 'png', intent: { kind: 'product' } })).rejects.toBeInstanceOf(SeamError);
  });

  it('每次调用都记账', async () => {
    const fake = createFakeShell([{}, {}]);
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });
    await seam.run({ command: 'git status', intent: { kind: 'none' } });
    await seam.run({ command: 'npm view x version', intent: { kind: 'product' } });
    expect(seam.facts()).toHaveLength(2);
    expect(seam.facts()[0]).toMatchObject({ command: 'git status', intent: 'none', mode: 'workspace-write' });
    expect(seam.facts()[1]).toMatchObject({ command: 'npm view x version', intent: 'product' });
  });
});

describe('createUnitSeam', () => {
  it('unit 域：根在产品域内，env 落在模块目录', async () => {
    const fake = createFakeShell([{}]);
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT, realHome: REAL_HOME });
    const unit = createUnitSeam({ seam, unit: 'demo', runtimeRoot: ROOT, realHome: REAL_HOME });
    await unit.run({ command: 'echo hi', scope: 'unit' });
    expect(policyOf(fake.calls[0])).toEqual({ mode: 'workspace-write', workspaceRoot: ROOT });
    const env = fake.calls[0]?.env;
    expect(env?.['HOME']).toBe(join(unitDataRoot(ROOT, 'demo'), 'home'));
    expect(env?.['npm_config_cache']).toBe(join(unitDataRoot(ROOT, 'demo'), 'npm-cache'));
  });

  it('workspace 域：清单没声明就拒绝；声明后要求会话', async () => {
    const fake = createFakeShell([{}, {}]);
    const seam = createSeam({
      shell: fake.shell,
      runtimeRoot: ROOT,
      grantOf: () => ({ mode: 'workspace-write', workspaceRoot: PROJECT }),
    });
    const undeclared = createUnitSeam({ seam, unit: 'demo', runtimeRoot: ROOT });
    await expect(undeclared.run({ command: 'touch x', scope: 'workspace', session: {} })).rejects.toMatchObject({
      code: 'scope-not-declared',
    });
    const declared = createUnitSeam({ seam, unit: 'demo', runtimeRoot: ROOT, declared: ['workspace'] });
    await expect(declared.run({ command: 'touch x', scope: 'workspace' })).rejects.toMatchObject({
      code: 'workspace-unknown',
    });
    await declared.run({ command: 'touch x', scope: 'workspace', session: {} });
    expect(policyOf(fake.calls[0])).toEqual({ mode: 'workspace-write', workspaceRoot: PROJECT });
  });
});
