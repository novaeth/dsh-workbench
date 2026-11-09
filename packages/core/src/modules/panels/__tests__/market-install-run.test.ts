import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { SupplyPort } from '@dsh-workbench/shared/host';
import { createInstallRunner } from '../model/market-install-run';
import { fakeSeamOf } from './seam-fake';

const ROOT = '/tmp/wb-install-run-runtime';
const SCRATCH = mkdtempSync(join(tmpdir(), 'wb-install-run-'));

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

const SUPPLY = {
  modules: { isolatedRoot: () => ROOT, isolatedHome: () => `${ROOT}-home` },
} as unknown as SupplyPort;

function runnerWith(replies: Parameters<typeof createFakeShell>[0], seam?: ReturnType<typeof fakeSeamOf>) {
  const fake = createFakeShell(replies);
  return {
    fake,
    runner: createInstallRunner({ seam: seam ?? fakeSeamOf(fake.shell), supply: SUPPLY }),
  };
}

describe('createInstallRunner', () => {
  it('★ 一条命令就是一步计划：命令原样进执行缝，退出码 0 即成功', async () => {
    const { fake, runner } = runnerWith([{}]);
    await runner.run("'opencli' plugin install '/opt/plugin'");
    expect(fake.commands()).toEqual(["'opencli' plugin install '/opt/plugin'"]);
  });

  it('★ 没有执行缝就直说：装 / 卸做不了（不是静默成功）', async () => {
    const runner = createInstallRunner({ supply: SUPPLY });
    await expect(runner.run('pnpm add --dir /p x')).rejects.toThrow(/没有执行缝/);
  });

  it('★ 非零退出转成安装诊断：退出码与输出都带出来', async () => {
    const { runner } = runnerWith([{ exitCode: 3, stderr: 'EACCES: permission denied' }]);
    const failure = await runner.run('pnpm add --dir /p x').then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure?.message).toContain('退出码 3');
    expect(failure?.message).toContain('EACCES');
  });

  it('★ optional 的命令非零退出不算失败，计划照旧往下走', async () => {
    const { fake, runner } = runnerWith([{ exitCode: 1, stderr: 'not installed' }, {}]);
    await runner.runAll([
      { kind: 'run', line: "'opencli' plugin uninstall 'demo'", optional: true },
      { kind: 'run', line: "'opencli' plugin install '/opt/demo'" },
    ]);
    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'", "'opencli' plugin install '/opt/demo'"]);
  });

  it('★ 文件步不进 shell：seam 只收到命令步，目录真被建出来', async () => {
    const { fake, runner } = runnerWith([{}]);
    const dir = join(SCRATCH, 'created', 'nested');
    await runner.runAll([
      { kind: 'mkdir', path: dir },
      { kind: 'run', line: 'pnpm add --dir /p x' },
    ]);
    expect(fake.commands()).toEqual(['pnpm add --dir /p x']);
    expect(existsSync(dir)).toBe(true);
  });

  it('★ 执行缝自己抛的错不被 optional 吞掉（沙箱拒绝要冒出去）', async () => {
    const { runner } = runnerWith([{ failWith: new Error('sandbox-denied') }]);
    await expect(runner.runAll([{ kind: 'run', line: 'pnpm add --dir /p x', optional: true }])).rejects.toThrow(
      'sandbox-denied',
    );
  });
});
