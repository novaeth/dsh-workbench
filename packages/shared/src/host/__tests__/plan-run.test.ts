import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { PluginPlanStep } from '../../contract/plugin-source.js';
import { PlanStepError, runPlan } from '../plan-run.js';
import { createSeam } from '../seam/run.js';
import { planLineOf, planStepText } from '../shell-render.js';
import { createFakeShell } from '../../testing/host-fakes.js';

const ROOT = join(tmpdir(), 'dsh-wb-plan-root');
const SCRATCH = mkdtempSync(join(tmpdir(), 'dsh-wb-plan-'));

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

function seamWith(replies: Parameters<typeof createFakeShell>[0]) {
  const fake = createFakeShell(replies);
  return { fake, seam: createSeam({ shell: fake.shell, runtimeRoot: ROOT }) };
}

describe('planStepText', () => {
  it('★ 命令步骤带 env 与调用符：POSIX 是前缀赋值，win32 是 $env: + &（另：执行用的 line 两者都不带）', () => {
    const plain: PluginPlanStep = { kind: 'run', line: "'opencli' plugin install '/x'" };
    expect(planStepText(plain, 'darwin')).toBe("'opencli' plugin install '/x'");
    expect(planStepText(plain, 'win32')).toBe("& 'opencli' plugin install '/x'");

    const withEnv: PluginPlanStep = {
      kind: 'run',
      line: "'opencli' plugin install '/x'",
      env: { NPM_CONFIG_REGISTRY: 'https://r.example' },
    };
    expect(planStepText(withEnv, 'darwin')).toBe(
      "NPM_CONFIG_REGISTRY='https://r.example' 'opencli' plugin install '/x'",
    );
    expect(planStepText(withEnv, 'win32')).toBe(
      "$env:NPM_CONFIG_REGISTRY='https://r.example'; & 'opencli' plugin install '/x'",
    );
    expect(JSON.stringify(withEnv)).not.toContain("NPM_CONFIG_REGISTRY='");
  });

  it('★ 不起引号的命令在 win32 上不加 &（pwsh 只在命令位置是字符串时才要调用符）', () => {
    expect(planStepText({ kind: 'run', line: 'pnpm add --dir /p x' }, 'win32')).toBe('pnpm add --dir /p x');
  });

  it('★ 文件操作步骤按平台给等价写法（Windows 上没有 rm -rf / ln -s / cp -R）', () => {
    expect(planStepText({ kind: 'remove', path: '/p/peer' }, 'darwin')).toBe("rm -rf '/p/peer'");
    expect(planStepText({ kind: 'mkdir', path: '/p' }, 'darwin')).toBe("mkdir -p '/p'");
    expect(planStepText({ kind: 'link', target: '/t', path: '/p/peer' }, 'darwin')).toBe("ln -s '/t' '/p/peer'");
    expect(planStepText({ kind: 'copy', from: '/c', to: '/d' }, 'darwin')).toBe("cp -R '/c'/. '/d'/");

    expect(planStepText({ kind: 'remove', path: 'C:\\p\\peer' }, 'win32')).toBe(
      "Remove-Item -Recurse -Force 'C:\\p\\peer'",
    );
    expect(planStepText({ kind: 'mkdir', path: 'C:\\p' }, 'win32')).toBe("New-Item -ItemType Directory -Force 'C:\\p'");
    expect(planStepText({ kind: 'link', target: 'C:\\t', path: 'C:\\p\\peer' }, 'win32')).toBe(
      "New-Item -ItemType Junction -Path 'C:\\p\\peer' -Target 'C:\\t'",
    );
    expect(planStepText({ kind: 'copy', from: 'C:\\c', to: 'C:\\d' }, 'win32')).toBe(
      "Copy-Item -Recurse -Force 'C:\\c' 'C:\\d'",
    );
  });

  it('★ 计划一行按目标 shell 的串联符拼（pwsh 5.1 不认 &&）', () => {
    const steps: readonly PluginPlanStep[] = [
      { kind: 'mkdir', path: '/p' },
      { kind: 'run', line: 'pnpm add --dir /p x' },
    ];
    expect(planLineOf(steps, 'linux')).toBe("mkdir -p '/p' && pnpm add --dir /p x");
    expect(planLineOf(steps, 'win32')).toBe("New-Item -ItemType Directory -Force '/p'; pnpm add --dir /p x");
  });
});

describe('runPlan', () => {
  it('★ 命令步骤把 env 交给执行缝，不在命令行里手拼 NAME=value', async () => {
    const { fake, seam } = seamWith([{}]);
    await runPlan(
      [
        { kind: 'run', line: "'opencli' plugin install '/x'", env: { NPM_CONFIG_REGISTRY: 'https://r.example' } },
      ],
      { seam, intent: { kind: 'product' } },
    );
    expect(fake.commands()).toEqual(["'opencli' plugin install '/x'"]);
    expect(fake.calls[0]?.env?.['NPM_CONFIG_REGISTRY']).toBe('https://r.example');
    expect(fake.calls[0]?.command).not.toContain('NPM_CONFIG_REGISTRY=');
  });

  it('★ optional 步骤失败不算失败，非 optional 抛 PlanStepError（带退出码与输出）', async () => {
    const optional = seamWith([{ exitCode: 1, stderr: 'no such plugin' }]);
    await expect(
      runPlan([{ kind: 'run', line: 'opencli plugin uninstall x', optional: true }], {
        seam: optional.seam,
        intent: { kind: 'product' },
      }),
    ).resolves.toBeUndefined();

    const required = seamWith([{ exitCode: 3, stderr: 'boom' }]);
    const failure = await runPlan([{ kind: 'run', line: 'pnpm add --dir /p x' }], {
      seam: required.seam,
      intent: { kind: 'product' },
    }).then(
      () => undefined,
      (error: unknown) => error as PlanStepError,
    );
    expect(failure).toBeInstanceOf(PlanStepError);
    expect(failure?.exitCode).toBe(3);
    expect(failure?.output).toBe('boom');
  });

  it('★ 文件步骤真落在 node:fs 上：删目录 / 建目录 / 目录链接 / 倒内容', async () => {
    const base = join(SCRATCH, 'fs');
    const from = join(base, 'from');
    const to = join(base, 'to');
    const link = join(base, 'nested', 'peer');
    mkdirSync(from, { recursive: true });
    writeFileSync(join(from, 'inside.txt'), 'hello', 'utf8');

    const { seam } = seamWith([{}]);
    await runPlan(
      [
        { kind: 'remove', path: to },
        { kind: 'copy', from, to },
        { kind: 'link', target: from, path: link },
      ],
      { seam, intent: { kind: 'product' } },
    );

    expect(readFileSync(join(to, 'inside.txt'), 'utf8')).toBe('hello');
    expect(readFileSync(join(link, 'inside.txt'), 'utf8')).toBe('hello');
    expect(existsSync(join(base, 'nested'))).toBe(true);

    await runPlan([{ kind: 'remove', path: to }], { seam, intent: { kind: 'product' } });
    expect(existsSync(to)).toBe(false);
  });

  it('★ 文件步骤炸了也走 PlanStepError（调用点只需接一种错）', async () => {
    const { seam } = seamWith([{}]);
    const blocker = join(SCRATCH, 'blocker-file');
    writeFileSync(blocker, 'not a dir', 'utf8');
    const bad = await runPlan([{ kind: 'link', target: blocker, path: join(blocker, 'peer') }], {
      seam,
      intent: { kind: 'product' },
    }).then(
      () => undefined,
      (error: unknown) => error as PlanStepError,
    );
    expect(bad).toBeInstanceOf(PlanStepError);
    expect(bad?.exitCode).toBeNull();
    expect(bad?.output).not.toBe('');
  });

  it('★ optional 只豁免非零退出；执行缝自己抛的错照旧冒出去（沙箱拒绝不被吞）', async () => {
    const denied = seamWith([{ failWith: new Error('sandbox-denied') }]);
    await expect(
      runPlan([{ kind: 'run', line: 'opencli plugin uninstall x', optional: true }], {
        seam: denied.seam,
        intent: { kind: 'product' },
      }),
    ).rejects.toThrow('sandbox-denied');
  });

  it('★ 每一步都过 check（界面与事实记的是计划文本）', async () => {
    const { seam } = seamWith([{}]);
    const seen: string[] = [];
    const dir = join(SCRATCH, 'hook');
    await runPlan(
      [
        { kind: 'mkdir', path: dir },
        { kind: 'run', line: 'pnpm add --dir /p x' },
      ],
      {
        seam,
        intent: { kind: 'product' },
        check: (step) => seen.push(`check:${step.kind}`),
      },
    );
    expect(seen).toEqual(['check:mkdir', 'check:run']);
  });
});
