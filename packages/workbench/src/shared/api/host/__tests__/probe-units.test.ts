import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePluginList, probeUnitCommands, probeUnits, resetProbeCache } from '../probe-units';
import { createFakeShell } from '@dsh-workbench/shared/testing';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetProbeCache();
});

const listOf = (commands: string[]) => ({ stdout: JSON.stringify([{ name: 'demo', commands }]) });

const pluginsOf = (plugins: Array<{ name: string; commands: string[] }>) => ({ stdout: JSON.stringify(plugins) });

describe('probeUnitCommands（单元级：demo 插件跟套件走）', () => {    it('命令齐了 → ok', async () => {
    const fake = createFakeShell([listOf(['issues', 'issue-statuses', 'issue-detail'])]);
    const result = await probeUnitCommands({
      shell: fake.shell,
      unit: { unit: 'unit-ok', plugins: [{ name: 'demo', commands: ['issues', 'issue-detail'] }] },
      force: true,
    });

    expect(result.status).toBe('ok');
    expect(result.missing).toEqual([]);
    expect(result.detail).toContain('份安装都在');
  });

  it('插件在但命令缺 → missing-commands，并列出缺哪几个（不是含糊的"失败"）', async () => {
    const fake = createFakeShell([listOf(['issues'])]);
    const result = await probeUnitCommands({
      shell: fake.shell,
      unit: { unit: 'unit-missing-cmd', plugins: [{ name: 'demo', commands: ['issues', 'issue-detail'] }] },
      force: true,
    });

    expect(result.status).toBe('missing-commands');
    expect(result.command).toContain('plugin update');
    expect(result.missing).toEqual(['issue-detail']);
  });

  it('连 demo 插件都没有 → missing-plugin', async () => {
    const fake = createFakeShell([{ stdout: JSON.stringify([{ name: 'deploy', commands: [] }]) }]);
    const result = await probeUnitCommands({
      shell: fake.shell,
      unit: { unit: 'unit-no-plugin', plugins: [{ name: 'demo', commands: ['issues'] }] },
      force: true,
    });

    expect(result.status).toBe('missing-plugin');
  });

  it('探不动（执行缝坏）→ unchecked，且不谎报"缺命令"', async () => {
    const fake = createFakeShell([{ failWith: new Error('shell 挂了') }]);
    const result = await probeUnitCommands({
      shell: fake.shell,
      unit: { unit: 'unit-unchecked', plugins: [{ name: 'demo', commands: ['issues'] }] },
      force: true,
    });

    expect(result.status).toBe('unchecked');
    expect(result.detail).toContain('shell 挂了');
  });

  it('结果记在进程内（机器事实，不是平台数据）：第二次不再跑命令，force 才重探', async () => {
    const fake = createFakeShell([listOf(['issues']), listOf(['issues'])]);
    const unit = { unit: 'unit-cache', plugins: [{ name: 'demo', commands: ['issues'] }] };

    await probeUnitCommands({ shell: fake.shell, unit, force: true });
    await probeUnitCommands({ shell: fake.shell, unit });
    expect(fake.calls).toHaveLength(1);

    await probeUnitCommands({ shell: fake.shell, unit, force: true });
    expect(fake.calls).toHaveLength(2);
  });
});

describe('probeUnitCommands：按**清单声明的插件**对账', () => {
  it('声明了别的插件就查那个插件（不写死 demo）—— 回归：曾经写死 demo，别的套件永远报缺命令', async () => {
    const fake = createFakeShell([
      { stdout: JSON.stringify([{ name: 'demo', commands: ['issues'] }, { name: 'deploy', commands: ['applications'] }]) },
    ]);
    const result = await probeUnitCommands({
      shell: fake.shell,
      unit: { unit: 'unit-deploy', plugins: [{ name: 'deploy', commands: ['applications'] }] },
      force: true,
    });

    expect(result.status).toBe('ok');
    expect(result.plugin).toBe('deploy');
  });

  it('声明的插件不在 → missing-plugin，并把插件名带出去（界面据此说"缺 X 插件"）', async () => {
    const fake = createFakeShell([{ stdout: JSON.stringify([{ name: 'demo', commands: ['issues'] }]) }]);
    const result = await probeUnitCommands({
      shell: fake.shell,
      unit: { unit: 'unit-no-deploy', plugins: [{ name: 'deploy', commands: ['applications'] }] },
      force: true,
    });

    expect(result.status).toBe('missing-plugin');
    expect(result.plugin).toBe('deploy');
    expect(result.command).toContain('deploy');
  });

  it('★ 每一份安装都必须**报名字**：名字对不上就是"没装"（不再有"所有插件里找"的宽松路径）', async () => {
    const fake = createFakeShell([listOf(['x', 'y'])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'unit-named', plugins: [{ name: 'not-demo', commands: ['x', 'y'] }] }],
      force: true,
    });

    expect(result?.status).toBe('missing-plugin');
    expect(result?.missing).toEqual([]);
  });

  it('三个套件只跑**一次** plugin list（同一份机器事实）', async () => {
    const fake = createFakeShell([
      pluginsOf([
        { name: 'demo', commands: ['issues', 'issue-detail'] },
        { name: 'deploy', commands: ['applications'] },
      ]),
    ]);

    const results = await probeUnits({
      shell: fake.shell,
      units: [
        { unit: 'a', plugins: [{ name: 'demo', commands: ['issues'] }] },
        { unit: 'b', plugins: [{ name: 'demo', commands: ['issue-detail'] }] },
        { unit: 'c', plugins: [{ name: 'deploy', commands: ['applications'] }] },
      ],
      force: true,
    });

    expect(fake.calls).toHaveLength(1);
    expect(results.map((item) => item.status)).toEqual(['ok', 'ok', 'ok']);
  });

  it('套件缺插件：`missing` **留空**（不是"少几个命令"，是整个插件没有）', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'deploy', commands: [] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'no-plugin', plugins: [{ name: 'demo', commands: ['issues', 'issue-detail'] }] }],
      force: true,
    });

    expect(result?.status).toBe('missing-plugin');
    expect(result?.missing).toEqual([]);
  });

  it('执行缝坏了 → unchecked，且 `missing` 为空（**不许**说成缺命令）', async () => {
    const fake = createFakeShell([{ failWith: new Error('shell 挂了') }]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'broken', plugins: [{ name: 'demo', commands: ['issues'] }] }],
      force: true,
    });

    expect(result?.status).toBe('unchecked');
    expect(result?.missing).toEqual([]);
    expect(result?.detail).toContain('shell 挂了');
  });

  it('退出码 0 但输出读不懂 → unchecked（"我读不懂"，不是"你没装插件"）', async () => {
    const fake = createFakeShell([{ stdout: '这不是 JSON' }]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'garbled', plugins: [{ name: 'demo', commands: ['issues'] }] }],
      force: true,
    });

    expect(result?.status).toBe('unchecked');
    expect(result?.detail).toContain('读不懂');
  });

  it('★ 缺一条声明的命令 → `missing-commands`（**没有**"可选命令只降级"那一档了，ADR-0016）', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'demo', commands: ['issues', 'issue-detail'] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [
        {
          unit: 'issues',
          plugins: [{ name: 'demo', commands: ['issues', 'issue-detail', 'issue-statuses'] }],
        },
      ],
      force: true,
    });

    expect(result?.status).toBe('missing-commands');
    expect(result?.missing).toEqual(['issue-statuses']);
  });

  it('缺命令 → missing-commands，缺哪几条就列哪几条', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'demo', commands: ['issues'] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [
        { unit: 'issues', plugins: [{ name: 'demo', commands: ['issues', 'issue-detail'] }] },
      ],
      force: true,
    });

    expect(result?.status).toBe('missing-commands');
    expect(result?.missing).toEqual(['issue-detail']);
  });

  it('插件在、命令齐 → ok；缺一个 → missing-commands 且只列缺的', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'demo', commands: ['issues'] }])]);

    const [ok, partial] = await probeUnits({
      shell: fake.shell,
      units: [
        { unit: 'ok', plugins: [{ name: 'demo', commands: ['issues'] }] },
        { unit: 'partial', plugins: [{ name: 'demo', commands: ['issues', 'issue-detail'] }] },
      ],
      force: true,
    });

    expect(ok?.status).toBe('ok');
    expect(partial?.status).toBe('missing-commands');
    expect(partial?.missing).toEqual(['issue-detail']);
  });
});

describe('fix 事实：能不能一键修（命令由宿主决定）', () => {
  it('插件不在 + 声明了 git 来源 → fix=install', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'other', commands: [] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [
        {
          unit: 'issues',
          plugins: [{ name: 'demo', commands: ['issues'], installSource: { kind: 'git', url: 'git@x:demo.git' } }],
        },
      ],
      force: true,
    });

    expect(result?.status).toBe('missing-plugin');
    expect(result?.fix).toBe('install');
    expect(result?.install).toBe('ready');
  });

  it('★ local 来源但环境变量**没设** → 不给 fix，并说明 env-missing', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'other', commands: [] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [
        {
          unit: 'issues',
          plugins: [
            {
              name: 'demo',
              commands: ['issues'],
              installSource: { kind: 'local', env: 'DSH_WORKBENCH_TEST_UNSET_PLUGIN' },
            },
          ],
        },
      ],
      force: true,
    });

    expect(result?.install).toBe('env-missing');
    expect(result?.fix).toBeUndefined();
  });

  it('local 来源 + 环境变量设了 → fix=install，命令里是**那一条 spec**', async () => {
    vi.stubEnv('DSH_WORKBENCH_TEST_PLUGIN', '/tmp/opencli-plugin-demo');
    const fake = createFakeShell([pluginsOf([{ name: 'other', commands: [] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [
        {
          unit: 'issues',
          plugins: [{ name: 'demo', commands: ['issues'], installSource: { kind: 'local', env: 'DSH_WORKBENCH_TEST_PLUGIN' } }],
        },
      ],
      force: true,
    });

    expect(result?.fix).toBe('install');
    expect(result?.install).toBe('ready');
    expect(result?.command).toContain('/tmp/opencli-plugin-demo');
  });

  it('★ npm 来源 + 源的环境变量设了 → fix=install，命令是**装进隔离运行时的三步**', async () => {
    const ENV = 'DSH_WB_TEST_NPM_REGISTRY';
    const REGISTRY = 'https://npm.example.com/team/repo';
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    vi.stubEnv(ENV, REGISTRY);
    const fake = createFakeShell([pluginsOf([{ name: 'other', commands: [] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [
        {
          unit: 'issues',
          plugins: [
            {
              name: 'demo',
              commands: ['issues'],
              installSource: { kind: 'npm', package: 'opencli-plugin-demo', registryEnv: ENV },
            },
          ],
        },
      ],
      force: true,
    });

    expect(result?.fix).toBe('install');
    expect(result?.install).toBe('ready');
    expect(result?.command).toContain(`npm i --prefix '/tmp/dshhome/workbench/opencli/plugins-npm'`);
    expect(result?.command).toContain('ln -s');
    expect(result?.command).toContain(`NPM_CONFIG_REGISTRY='${REGISTRY}'`);
    expect(result?.command).toContain('plugin install');
    expect(result?.command).toContain("('opencli' plugin uninstall 'demo' || true)");
  });

  it('插件不在但**没声明来源** → 不给 fix（不许猜地址去装）', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'other', commands: [] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'issues', plugins: [{ name: 'demo', commands: ['issues'] }] }],
      force: true,
    });

    expect(result?.status).toBe('missing-plugin');
    expect(result?.fix).toBeUndefined();
  });

  it('缺必需命令（版本旧）→ fix=update，并给升级命令', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'demo', commands: ['issues'] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'issues', plugins: [{ name: 'demo', commands: ['issues', 'issue-detail'] }] }],
      force: true,
    });

    expect(result?.status).toBe('missing-commands');
    expect(result?.fix).toBe('update');
    expect(result?.command).toBe('opencli plugin update demo');
  });

  it('缺命令 → 也给 fix=update（升级就能补上）', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'demo', commands: ['issues'] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'issues', plugins: [{ name: 'demo', commands: ['issues', 'issue-statuses'] }] }],
      force: true,
    });

    expect(result?.status).toBe('missing-commands');
    expect(result?.fix).toBe('update');
  });

  it('都齐 → 没有 fix（没有要修的东西）', async () => {
    const fake = createFakeShell([pluginsOf([{ name: 'demo', commands: ['issues'] }])]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'issues', plugins: [{ name: 'demo', commands: ['issues'] }] }],
      force: true,
    });

    expect(result?.fix).toBeUndefined();
  });
});

describe('parsePluginList', () => {
  it('JSON 数组照读', () => {
    expect(parsePluginList('[{"name":"demo"}]')).toEqual([{ name: 'demo' }]);
  });

  it('★ 零插件时的人话 = 空列表（不是"读不懂"）', () => {
    const stdout = '  No plugins installed.\n  Install one with: opencli plugin install github:user/repo\n';

    expect(parsePluginList(stdout)).toEqual([]);
  });

  it('大小写与无句号的说法都认（同一句话的不同印法）', () => {
    expect(parsePluginList('no plugin installed')).toEqual([]);
  });

  it('真的读不懂 → undefined（不猜成"没装"）', () => {
    expect(parsePluginList('这不是 JSON')).toBeUndefined();
  });

  it('★ 零插件的机器上：探出来是 **missing-plugin**（该装），不是 unchecked', async () => {
    const fake = createFakeShell([{ stdout: '  No plugins installed.\n' }]);

    const [result] = await probeUnits({
      shell: fake.shell,
      units: [{ unit: 'fresh', plugins: [{ name: 'demo', commands: ['issues'] }] }],
      force: true,
    });

    expect(result?.status).toBe('missing-plugin');
  });
});

describe('probeUnits 的并发合流（两页同时打开只跑一轮）', () => {
  it('★ 同一批并发探只发一轮 `plugin list`，两边拿到同一份', async () => {
    const fake = createFakeShell([listOf(['issues'])]);
    const units = [{ unit: 'inflight', plugins: [{ name: 'demo', commands: ['issues'] }] }];

    const [first, second] = await Promise.all([
      probeUnits({ shell: fake.shell, units }),
      probeUnits({ shell: fake.shell, units }),
    ]);

    expect(fake.calls).toHaveLength(1);
    expect(first?.[0]?.status).toBe('ok');
    expect(second).toEqual(first);
  });
});
