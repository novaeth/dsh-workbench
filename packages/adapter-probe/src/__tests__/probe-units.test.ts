import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { extensionNeedOf, envNeedOf, binNeedOf } from '@dsh-workbench/shared/testing';
import type { Need, NeedState } from '@dsh-workbench/shared/host';
import { parsePluginList, probeUnitCommands, probeUnits, resetProbeCache } from '../index.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetProbeCache();
});

const RUNTIMES = { opencli: 'opencli' } as const;
const listOf = (commands: string[], name = 'demo') => ({ stdout: JSON.stringify([{ name, commands }]) });
const stateOf = (capability: { needs: readonly NeedState[] }, kind: string, name: string) =>
  capability.needs.find((need) => need.kind === kind && need.name === name);

async function probeOne(
  needs: readonly Need[],
  responses: Parameters<typeof createFakeShell>[0] = [],
  options: { runtimeCommands?: Readonly<Record<string, string>> } = {},
) {
  const fake = createFakeShell(responses);
  const found = await probeUnits({
    shell: fake.shell,
    runtimeCommands: options.runtimeCommands ?? RUNTIMES,
    units: [{ unit: 'u', needs }],
    force: true,
  });
  return { fake, capability: found[0]! };
}

describe('probeUnits：extension 一类', () => {
  it('命令齐了 → need ok、unit ok', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { commands: ['issues', 'issue-detail'] })],
      [listOf(['issues', 'issue-detail'])],
    );

    expect(capability.status).toBe('ok');
    expect(stateOf(capability, 'extension', 'demo')).toMatchObject({ status: 'ok' });
  });

  it('插件在但命令缺 → need outdated，列出缺哪几个（不是含糊的"失败"）', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { commands: ['issues', 'issue-detail'] })],
      [listOf(['issues'])],
    );

    const state = stateOf(capability, 'extension', 'demo');
    expect(capability.status).toBe('outdated');
    expect(state?.status).toBe('outdated');
    expect(state?.missing).toEqual(['issue-detail']);
    expect(state?.command).toContain('plugin update');
  });

  it('插件不在 → need missing，unit missing', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { sources: [{ kind: 'git', url: 'git@x:demo.git' }] })],
      [{ stdout: JSON.stringify([{ name: 'deploy', commands: [] }]) }],
    );

    const state = stateOf(capability, 'extension', 'demo');
    expect(capability.status).toBe('missing');
    expect(state?.status).toBe('missing');
    expect(state?.provision).toBe('ready');
    expect(state?.command).toContain('git@x:demo.git');
  });

  it('执行缝坏了 → need unchecked（带原因），且不谎报"缺命令"', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo')],
      [{ failWith: new Error('shell 挂了') }],
    );

    const state = stateOf(capability, 'extension', 'demo');
    expect(capability.status).toBe('unchecked');
    expect(state?.status).toBe('unchecked');
    expect(state?.detail).toContain('shell 挂了');
    expect(state?.missing).toBeUndefined();
  });

  it('退出码 0 但输出读不懂 → unchecked（"我读不懂"，不是"你没装插件"）', async () => {
    const { capability } = await probeOne([extensionNeedOf('demo')], [{ stdout: '不是 JSON' }]);

    expect(capability.status).toBe('unchecked');
    expect(stateOf(capability, 'extension', 'demo')?.detail).toContain('读不懂');
  });

  it('★ 每一份安装都必须**报名字**：名字对不上就是"没装"', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo')],
      [{ stdout: JSON.stringify([{ name: 'other', commands: ['x'] }]) }],
    );

    expect(stateOf(capability, 'extension', 'demo')?.status).toBe('missing');
  });

  it('★ 三个单元只跑**一次** plugin list（同一份机器事实）', async () => {
    const fake = createFakeShell([listOf(['issues'])]);
    const units = ['a', 'b', 'c'].map((unit) => ({ unit, needs: [extensionNeedOf('demo')] }));

    const found = await probeUnits({ shell: fake.shell, runtimeCommands: RUNTIMES, units, force: true });

    expect(found).toHaveLength(3);
    expect(fake.calls).toHaveLength(1);
  });

  it('零插件的机器上探出来是 missing（该装），不是 unchecked', async () => {
    const { capability } = await probeOne([extensionNeedOf('demo')], [{ stdout: 'No plugins installed.' }]);

    expect(capability.status).toBe('missing');
  });

  it('不认识的运行时 → need unchecked，说清是运行时没探法', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { runtime: 'future-cli' })],
      [],
      { runtimeCommands: {} },
    );

    const state = stateOf(capability, 'extension', 'demo');
    expect(state?.status).toBe('unchecked');
    expect(state?.detail).toContain('future-cli');
  });
});

describe('probeUnits：provision / update 的事实', () => {
  it('插件不在 + git 来源 → provision=ready，命令就是那一条 spec', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { sources: [{ kind: 'git', url: 'git@x:demo.git' }] })],
      [{ stdout: '[]' }],
    );

    expect(stateOf(capability, 'extension', 'demo')?.command).toContain("'opencli' plugin install 'git@x:demo.git'");
  });

  it('local 来源 + 环境变量设了 → provision=ready，命令里是那一条路径', async () => {
    vi.stubEnv('DSH_WORKBENCH_TEST_PLUGIN', '/opt/plugin');
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { sources: [{ kind: 'local', env: 'DSH_WORKBENCH_TEST_PLUGIN' }] })],
      [{ stdout: '[]' }],
    );

    const state = stateOf(capability, 'extension', 'demo');
    expect(state?.provision).toBe('ready');
    expect(state?.command).toContain('/opt/plugin');
  });

  it('★ local 来源但环境变量没设 → provision=env-missing（界面据此给能照做的话）', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { sources: [{ kind: 'local', env: 'DSH_WORKBENCH_TEST_UNSET' }] })],
      [{ stdout: '[]' }],
    );

    expect(stateOf(capability, 'extension', 'demo')?.provision).toBe('env-missing');
  });

  it('插件不在但**没声明来源** → provision=not-declared（不许猜地址去装）', async () => {
    const { capability } = await probeOne([extensionNeedOf('demo')], [{ stdout: '[]' }]);

    expect(stateOf(capability, 'extension', 'demo')?.provision).toBe('not-declared');
  });

  it('缺必需命令（版本旧）→ 给升级命令', async () => {
    const { capability } = await probeOne(
      [extensionNeedOf('demo', { commands: ['issues'] })],
      [listOf([])],
    );

    expect(stateOf(capability, 'extension', 'demo')?.command).toBe("'opencli' plugin update 'demo'");
  });

  it('都齐 → 没有命令', async () => {
    const { capability } = await probeOne([extensionNeedOf('demo')], [listOf(['demo-read'])]);

    expect(stateOf(capability, 'extension', 'demo')?.command).toBeUndefined();
  });
});

describe('probeUnits：bin / env 两类', () => {
  it('★★ bin 不在 PATH → need missing + 命令名，且不跑 plugin list', async () => {
    const { fake, capability } = await probeOne([binNeedOf('gitops')], [{ exitCode: 1, stdout: '' }]);

    expect(capability.status).toBe('missing');
    expect(stateOf(capability, 'bin', 'gitops')).toMatchObject({ status: 'missing' });
    expect(fake.commands().some((line) => line.includes('plugin list'))).toBe(false);
  });

  it('★ 作者声明了 install 且机器上缺 → 带上那条命令，界面才有得点', async () => {
    const { capability } = await probeOne(
      [
        binNeedOf('gitops', {
          install: { kind: 'command', line: 'brew install pagoda/tap/gitops', platforms: [process.platform] },
        }),
      ],
      [{ exitCode: 1, stdout: '' }],
    );

    expect(stateOf(capability, 'bin', 'gitops')).toMatchObject({
      status: 'missing',
      provision: 'ready',
      command: 'brew install pagoda/tap/gitops',
    });
  });

  it('★ install 是 npm 包 → 命令装进隔离运行时的共用依赖前缀（不碰全局）', async () => {
    const { capability } = await probeOne(
      [
        binNeedOf('gitops', {
          install: { kind: 'npm', package: 'opencli-workflow' },
        }),
      ],
      [{ exitCode: 1, stdout: '' }],
    );

    const state = stateOf(capability, 'bin', 'gitops');
    expect(state?.provision).toBe('ready');
    expect(state?.command).toContain('npm i --prefix');
    expect(state?.command).toContain('opencli-workflow');
    expect(state?.command).toContain('--cache');
    expect(state?.command).not.toContain('-g');
  });

  it('平台对不上 → 不给命令（别教用户在 Windows 上跑 brew）', async () => {
    const other = process.platform === 'darwin' ? 'linux' : 'darwin';
    const { capability } = await probeOne(
      [binNeedOf('gitops', { install: { kind: 'command', line: 'brew install x', platforms: [other] } })],
      [{ exitCode: 1, stdout: '' }],
    );

    expect(stateOf(capability, 'bin', 'gitops')?.command).toBeUndefined();
    expect(stateOf(capability, 'bin', 'gitops')?.provision).toBeUndefined();
  });

  it('bin 在 PATH → ok', async () => {
    const { capability } = await probeOne([binNeedOf('gitops')], [{ exitCode: 0, stdout: '/usr/bin/gitops' }]);

    expect(stateOf(capability, 'bin', 'gitops')?.status).toBe('ok');
  });

  it('★ 和运行时命令同名 → 不探（工作台自己的 opencli 不在 PATH 也算有）', async () => {
    const { fake, capability } = await probeOne([binNeedOf('opencli')], [], {
      runtimeCommands: { opencli: '/opt/workbench/bin/opencli' },
    });

    expect(stateOf(capability, 'bin', 'opencli')?.status).toBe('ok');
    expect(fake.commands().filter((line) => line.includes('command -v'))).toHaveLength(0);
  });

  it('env 设了 → ok；没设 → missing 且 secret 不回显值', async () => {
    vi.stubEnv('DSH_WORKBENCH_TEST_TOKEN', 'super-secret');
    const { capability } = await probeOne([
      envNeedOf('DSH_WORKBENCH_TEST_TOKEN'),
      envNeedOf('DSH_WORKBENCH_TEST_MISSING', { secret: true }),
    ]);

    expect(stateOf(capability, 'env', 'DSH_WORKBENCH_TEST_TOKEN')?.status).toBe('ok');
    const missing = stateOf(capability, 'env', 'DSH_WORKBENCH_TEST_MISSING');
    expect(missing?.status).toBe('missing');
    expect(missing?.secret).toBe(true);
    expect(JSON.stringify(capability)).not.toContain('super-secret');
  });
});

describe('probeUnits：汇总', () => {
  it('required: false 缺了 → unit degraded，need 仍报 missing', async () => {
    const { capability } = await probeOne([binNeedOf('nope', { required: false })], [{ exitCode: 1, stdout: '' }]);

    expect(capability.status).toBe('degraded');
    expect(stateOf(capability, 'bin', 'nope')?.status).toBe('missing');
  });

  it('最坏的那条决定 unit status（missing 赢过 outdated）', async () => {
    const { capability } = await probeOne(
      [
        extensionNeedOf('demo', { commands: ['issues', 'detail'] }),
        binNeedOf('gitops'),
      ],
      (call) => (call.command.includes('plugin list') ? listOf(['issues']) : { exitCode: 1, stdout: '' }),
    );

    expect(capability.status).toBe('missing');
    expect(stateOf(capability, 'extension', 'demo')?.status).toBe('outdated');
  });
});

describe('probeUnits：供给索引与冲突', () => {
  it('★★ 两个单元声明同一个插件、源不同 → 两家都 unchecked，不 last-wins', async () => {
    const fake = createFakeShell([listOf(['demo-read'])]);
    const units = [
      { unit: 'a', needs: [extensionNeedOf('demo', { sources: [{ kind: 'git', url: 'git@x:a.git' }] })] },
      { unit: 'b', needs: [extensionNeedOf('demo', { sources: [{ kind: 'git', url: 'git@x:b.git' }] })] },
    ];

    const found = await probeUnits({ shell: fake.shell, runtimeCommands: RUNTIMES, units, force: true });

    for (const one of found) {
      const state = stateOf(one, 'extension', 'demo');
      expect(state?.status).toBe('unchecked');
      expect(state?.detail).toContain('来源冲突');
    }
    expect(fake.calls).toHaveLength(0);
  });

  it('★ 单单元入口给了 catalog 才看得见别人的声明；不给就只顾自己', async () => {
    const mine = extensionNeedOf('demo', { sources: [{ kind: 'git', url: 'git@x:a.git' }] });
    const theirs = extensionNeedOf('demo', { sources: [{ kind: 'git', url: 'git@x:b.git' }] });

    const alone = createFakeShell([listOf(['demo-read'])]);
    const solo = await probeUnitCommands({
      shell: alone.shell,
      runtimeCommands: RUNTIMES,
      unit: { unit: 'a', needs: [mine] },
      force: true,
    });
    expect(stateOf(solo, 'extension', 'demo')?.status).toBe('ok');

    const together = createFakeShell([]);
    const conflicted = await probeUnitCommands({
      shell: together.shell,
      runtimeCommands: RUNTIMES,
      unit: { unit: 'a', needs: [mine] },
      catalog: [
        { unit: 'a', needs: [mine] },
        { unit: 'b', needs: [theirs] },
      ],
      force: true,
    });
    expect(stateOf(conflicted, 'extension', 'demo')?.status).toBe('unchecked');
  });
});

describe('probeUnits：缓存与并发', () => {
  it('结果记在进程内：第二次不再跑命令，force 才重探', async () => {
    const fake = createFakeShell([listOf(['demo-read']), listOf(['demo-read'])]);
    const unit = { unit: 'u', needs: [extensionNeedOf('demo')] };

    await probeUnits({ shell: fake.shell, runtimeCommands: RUNTIMES, units: [unit], force: true });
    await probeUnits({ shell: fake.shell, runtimeCommands: RUNTIMES, units: [unit] });
    expect(fake.calls).toHaveLength(1);

    await probeUnits({ shell: fake.shell, runtimeCommands: RUNTIMES, units: [unit], force: true });
    expect(fake.calls).toHaveLength(2);
  });

  it('★ 同一批并发探只发一轮 plugin list，两边拿到同一份', async () => {
    const fake = createFakeShell([listOf(['demo-read'])]);
    const unit = { unit: 'u', needs: [extensionNeedOf('demo')] };

    const [first, second] = await Promise.all([
      probeUnits({ shell: fake.shell, runtimeCommands: RUNTIMES, units: [unit], force: true }),
      probeUnits({ shell: fake.shell, runtimeCommands: RUNTIMES, units: [unit] }),
    ]);

    expect(fake.calls).toHaveLength(1);
    expect(first).toEqual(second);
  });
});

describe('parsePluginList', () => {
  it('JSON 数组照读', () => {
    expect(parsePluginList('[{"name":"demo"}]')).toEqual([{ name: 'demo' }]);
  });

  it('★ 零插件时的人话 = 空列表（不是"读不懂"）', () => {
    expect(parsePluginList('No plugins installed')).toEqual([]);
    expect(parsePluginList('no plugin installed.')).toEqual([]);
  });

  it('真的读不懂 → undefined（不猜成"没装"）', () => {
    expect(parsePluginList('error: something')).toBeUndefined();
  });
});
