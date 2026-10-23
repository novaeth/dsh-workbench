import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { UnitCapability } from '@/shared/api/host/probe-units';
import type { UnitLibNeed, UnitManifest, UnitPluginNeed } from '@dsh-workbench/shared';
import { createMarketService } from '../model/market';
import { dispatchMarket } from '../model/market-dispatch';
import {
  affectedUnitsOf,
  dependencyCommandPlan,
  findDependency,
  sharedDependencies,
} from '../model/market-dependency';

afterEach(() => {
  vi.unstubAllEnvs();
});

function unit(
  id: string,
  needs: { readonly plugin?: UnitPluginNeed; readonly lib?: UnitLibNeed } = {},
): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    env: {
      command: 'opencli',
      ...(needs.plugin === undefined ? {} : { plugins: [needs.plugin] }),
      ...(needs.lib === undefined ? {} : { libs: [needs.lib] }),
    },
  };
}

const LIB: UnitLibNeed = {
  name: 'opencli-workflow',
  version: '1.1.22',
  registryEnv: 'DSH_WB_TEST_REGISTRY',
  registryDefault: 'https://r.invalid/',
  purpose: '发布编排',
};

function capability(id: string, extra: Partial<UnitCapability> = {}): UnitCapability {
  return { unit: id, status: 'ok', required: [], missing: [], detail: '假探测', ...extra };
}

const pluginState = (status: UnitCapability['status'], extra: Record<string, unknown> = {}) => ({
  name: 'demo',
  status: status === 'missing-plugin' ? 'missing' : status === 'missing-commands' ? 'outdated' : 'ok',
  missing: [],
  ...extra,
});

describe('sharedDependencies：跨模块聚合', () => {
  it('★ 一行 = 一份安装：两个模块声明同一份 → 一行，usedBy 是那两个模块', () => {
    const manifests = [unit('a', { plugin: { name: 'demo', commands: ['x'] } }), unit('b', { plugin: { name: 'demo', commands: ['x'] } })];

    const shared = sharedDependencies({
      manifests,
      capabilities: new Map([
        ['a', capability('a', { plugins: [pluginState('ok') as never] })],
        ['b', capability('b', { plugins: [pluginState('ok') as never] })],
      ]),
    });

    expect(shared.map((dep) => dep.id)).toEqual(['plugin:demo']);
    expect(shared[0]?.usedBy).toEqual(['a', 'b']);
    expect(shared[0]?.status).toBe('ok');
  });

  it('★ 放手过的模块不算使用者；全放手了那一行就不列', () => {
    const manifests = [unit('a', { lib: LIB }), unit('b', { lib: LIB })];
    const caps = new Map([
      ['a', capability('a', { libs: [{ ...LIB, status: 'ok', installed: '1.1.22' }] })],
      ['b', capability('b', { libs: [{ ...LIB, status: 'ok', installed: '1.1.22' }] })],
    ]);

    expect(sharedDependencies({ manifests, capabilities: caps, isReleased: (id) => id === 'a' })[0]?.usedBy).toEqual([
      'b',
    ]);
    expect(
      sharedDependencies({ manifests, capabilities: caps, isReleased: () => true }),
    ).toEqual([]);
  });

  it('★ status 取最差（missing 赢过 outdated 与 ok），有信号才给版本', () => {
    const manifests = [unit('a', { lib: LIB }), unit('b', { lib: LIB })];
    const caps = new Map([
      ['a', capability('a', { libs: [{ ...LIB, status: 'outdated', installed: '1.1.22', latest: '1.1.23' }] })],
      ['b', capability('b', { libs: [{ ...LIB, status: 'missing' }] })],
    ]);

    const [dep] = sharedDependencies({ manifests, capabilities: caps });

    expect(dep?.status).toBe('missing');
    expect(dep?.installed).toBe('1.1.22');
    expect(dep?.latest).toBe('1.1.23');
    expect(dep?.purpose).toBe('发布编排');
  });

  it('★ 探不动 → unchecked（不谎报"没装"）', () => {
    const [dep] = sharedDependencies({
      manifests: [unit('a', { plugin: { name: 'demo', commands: ['x'] } })],
      capabilities: new Map([['a', capability('a', { status: 'unchecked' })]]),
    });

    expect(dep?.status).toBe('unchecked');
  });
});

describe('dependencyCommandPlan：只升点名的那一份（共用依赖没有安装）', () => {
  const pluginUnit = unit('a', {
    plugin: { name: 'demo', commands: ['x'], installSource: { kind: 'git', url: 'git@x:demo.git' } },
  });

  it('★ 没装（missing）→ `undefined`：安装不是共用依赖的动作（用户口径 2026-09-30）', () => {
    const target = findDependency([pluginUnit], 'plugin:demo');

    expect(
      dependencyCommandPlan({
        target: target as never,
        capability: capability('a', { plugins: [pluginState('missing-plugin') as never] }),
        command: 'opencli',
      }),
    ).toBeUndefined();
  });

  it('★ 能力按声明者配对：第一家探不到新版、第二家探到了 → 用第二家的（原来只喂第一家 → 静默不升）', () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    const source = {
      kind: 'npm' as const,
      package: 'opencli-plugin-demo',
      registryEnv: 'DSH_WB_ONLY_ENV',
      registryDefault: 'https://r.invalid/',
    };
    const target = findDependency(
      [
        unit('a', { plugin: { name: 'demo', commands: ['x'], installSource: source } }),
        unit('b', { plugin: { name: 'demo', commands: ['x'], installSource: source } }),
      ],
      'plugin:demo',
    );

    const plan = dependencyCommandPlan({
      target: target as never,
      capability: capability('a'),
      capabilities: new Map([
        ['a', capability('a')],
        ['b', capability('b', { plugins: [pluginState('missing-commands', { release: { installed: '1.0.0', latest: '1.1.0' } }) as never] })],
      ]),
      command: 'opencli',
    });

    expect(plan?.some((line) => line.line.includes('opencli-plugin-demo@1.1.0'))).toBe(true);
  });

  it('★ 同一份插件两家声明 → 用能解析的那家（缺 registryDefault + env 没设不再算死）', () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    const source = { kind: 'npm' as const, package: 'opencli-plugin-demo', registryEnv: 'DSH_WB_ONLY_ENV' };
    const target = findDependency(
      [
        unit('a', { plugin: { name: 'demo', commands: ['x'], installSource: source } }),
        unit('b', {
          plugin: {
            name: 'demo',
            commands: ['x'],
            installSource: { ...source, registryDefault: 'https://r.invalid/' },
          },
        }),
      ],
      'plugin:demo',
    );

    const plan = dependencyCommandPlan({
      target: target as never,
      capability: capability('a', {
        plugins: [pluginState('missing-commands', { release: { installed: '1.0.0', latest: '1.1.0' } }) as never],
      }),
      command: 'opencli',
    });

    expect(plan?.some((line) => line.line.includes('opencli-plugin-demo@1.1.0'))).toBe(true);
    expect(plan?.some((line) => line.line.includes('https://r.invalid/'))).toBe(true);
  });

  it('★ 已经是最新 → 幂等（`undefined`，一条命令都不跑）', () => {
    const target = findDependency([pluginUnit], 'plugin:demo');

    expect(
      dependencyCommandPlan({
        target: target as never,
        capability: capability('a', { plugins: [pluginState('ok') as never] }),
        command: 'opencli',
      }),
    ).toBeUndefined();
  });

  it('★ 插件有版本信号 → 升级走 `mode:"update"`（原地重装 prefix，不是 `plugin update`）', () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    const target = findDependency(
      [unit('a', { plugin: { name: 'demo', commands: ['x'], installSource: { kind: 'npm', package: 'opencli-plugin-demo', registryEnv: 'DSH_WB_TEST_REGISTRY', registryDefault: 'https://r.invalid/' } } })],
      'plugin:demo',
    );
    const plan = dependencyCommandPlan({
      target: target as never,
      capability: capability('a', {
        plugins: [pluginState('missing-commands', { release: { installed: '1.0.0', latest: '1.1.0' } }) as never],
      }),
      command: 'opencli',
    });

    const lines = (plan ?? []).map((step) => step.line);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('npm i --prefix');
    expect(lines[0]).toContain('opencli-plugin-demo@1.1.0');
    expect(lines[1]).toContain('ln -s');
    expect(lines.join(' ')).not.toContain('plugin update');
  });

  it('★ 插件没有版本信号 → 退回 `plugin update <名字>`', () => {
    const target = findDependency([pluginUnit], 'plugin:demo');
    const plan = dependencyCommandPlan({
      target: target as never,
      capability: capability('a', { plugins: [pluginState('missing-commands') as never] }),
      command: 'opencli',
    });

    expect((plan ?? []).map((step) => step.line)).toEqual(["'opencli' plugin update 'demo'"]);
  });

  it('★ 来源拿不到（变量没设）→ 退回 `plugin update`（升级不该被"来源"卡住）', () => {
    const target = findDependency(
      [unit('a', { plugin: { name: 'demo', commands: ['x'], installSource: { kind: 'local', env: 'DSH_WB_UNSET' } } })],
      'plugin:demo',
    );
    const plan = dependencyCommandPlan({
      target: target as never,
      capability: capability('a', {
        plugins: [pluginState('missing-commands', { release: { installed: '1.0.0', latest: '1.1.0' } }) as never],
      }),
      command: 'opencli',
    });

    expect((plan ?? []).map((step) => step.line)).toEqual(["'opencli' plugin update 'demo'"]);
  });

  it('库没装 → `undefined`；库有新版 → 照源上那版装', () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    const libUnit = unit('a', { lib: LIB });
    const target = findDependency([libUnit], 'lib:opencli-workflow');

    expect(
      dependencyCommandPlan({
        target: target as never,
        capability: capability('a', { libs: [{ ...LIB, status: 'missing' }] }),
        command: 'opencli',
      }),
    ).toBeUndefined();

    const update = dependencyCommandPlan({
      target: target as never,
      capability: capability('a', { libs: [{ ...LIB, status: 'outdated', installed: '1.1.22', latest: '1.1.23' }] }),
      command: 'opencli',
    });
    const line = update?.[0]?.line ?? '';
    expect(line).toContain("opencli-workflow@1.1.23");
    expect(line).toContain("--prefix '/tmp/dshhome/workbench/opencli/libs'");
  });

  it('★ 库**版本不对** → 按**声明**装（这一行给的「更新」修的是"不对版"，不是"升到最新"）', () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    const target = findDependency([unit('a', { lib: LIB })], 'lib:opencli-workflow');
    const plan = dependencyCommandPlan({
      target: target as never,
      capability: capability('a', { libs: [{ ...LIB, status: 'unsatisfied', installed: '1.0.9' }] }),
      command: 'opencli',
    });

    const line = plan?.[0]?.line ?? '';
    expect(line).toContain('opencli-workflow@1.1.22');
  });
});

describe('市场服务：依赖动作', () => {
  function marketWith(replies: Parameters<typeof createFakeShell>[0] = [{ stdout: '' }]) {
    const fake = createFakeShell(replies);
    const market = createMarketService({
      manifests: [unit('a', { plugin: { name: 'demo', commands: ['x'], installSource: { kind: 'git', url: 'git@x:demo.git' } } }), unit('b', { plugin: { name: 'demo', commands: ['x'], installSource: { kind: 'git', url: 'git@x:demo.git' } } })],
      probe: async (id: string): Promise<UnitCapability> => {
        const updated = fake.commands().length > 0;
        return capability(id, {
          status: updated ? 'ok' : 'missing-commands',
          plugins: [pluginState(updated ? 'ok' : 'missing-commands') as never],
        });
      },
      shell: fake.shell,
    });
    return { market, fake };
  }

  it('★ 升一份依赖只跑它自己那条命令（不牵连别的行）', async () => {
    const { market, fake } = marketWith();

    const shared = await market.updateDependency('plugin:demo');

    expect(fake.commands()).toEqual(["'opencli' plugin update 'demo'"]);
    expect(shared.map((dep) => dep.id)).toEqual(['plugin:demo']);
    expect(shared[0]?.usedBy).toEqual(['a', 'b']);
  });

  it('★ 服务面上没有"装一份依赖"这件事（装了就没得装，用户口径 2026-09-30）', () => {
    const { market } = marketWith();

    expect(Object.keys(market)).not.toContain('installDependency');
  });

  it('未知 / 没人声明的依赖 → 抛，并列出可用的（静默忽略会让调用方以为成功了）', async () => {
    const { market } = marketWith();

    await expect(market.updateDependency('nope')).rejects.toThrow(/市场里没有这份依赖：nope/);
    await expect(market.updateDependency('lib:opencli-workflow')).rejects.toThrow(/市场里没有这份依赖/);
  });

  it('★ dispatch：依赖动作回 `shared`，模块动作回 `module`（两种形状分开）', async () => {
    const { market } = marketWith();

    const result = await dispatchMarket(market, { action: 'update-dependency', id: 'plugin:demo' });

    expect(result).toMatchObject({ ok: true, action: 'update-dependency', shared: [expect.objectContaining({ id: 'plugin:demo' })] });
  });
});

describe('市场服务：交叉依赖的装', () => {
  const libUnit: UnitManifest = {
    id: 'inventory',
    card: { titleKey: 'inventory.mine', order: 10 },
    tools: [],
    host: { inject: [] },
    env: {
      command: 'opencli',
      libs: [
        {
          name: 'opencli-workflow',
          version: '^1.1.20',
          registryEnv: 'DSH_WB_LIB_REGISTRY',
          registryDefault: 'https://r.invalid/',
          purpose: '发布编排',
        },
      ],
    },
  };

  it('★ 库**版本不对**也算"没装好"：安装跑的是**声明**（`@^1.1.20`），不是"装源上最新"', async () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [libUnit],
      probe: async (id: string): Promise<UnitCapability> => ({
        unit: id,
        status: 'missing-plugin',
        required: [],
        missing: [],
        detail: 'opencli-workflow（装的是 1.1.19，声明要 ^1.1.20）',
        install: 'ready',
        libs: [
          { name: 'opencli-workflow', purpose: '发布编排', status: 'unsatisfied', installed: '1.1.19' },
        ],
      }),
      shell: fake.shell,
    });

    await market.install('inventory');

    const ran = fake.commands();
    expect(ran).toHaveLength(1);
    expect(ran[0]).toContain('opencli-workflow@^1.1.20');
    expect(ran[0]).not.toContain('@latest');
  });
});

describe('affectedUnitsOf：这次动作惊动哪些模块（用它的面板要跟着重读）', () => {
  function manifest(id: string, plugins: readonly string[], libs: readonly string[] = []): UnitManifest {
    return {
      id,
      card: { titleKey: `${id}.mine`, order: 10 },
      tools: [],
      host: { inject: [] },
      env: {
        command: 'opencli',
        plugins: plugins.map((name) => ({ name, commands: ['x'] })),
        ...(libs.length === 0
          ? {}
          : {
              libs: libs.map((name) => ({
                name,
                registryEnv: 'DSH_WB_TEST_REGISTRY',
                registryDefault: 'https://r.invalid/',
                purpose: '编排',
              })),
            }),
      },
    };
  }

  const manifests = [
    manifest('inventory', ['inventory', 'demo'], ['opencli-workflow']),
    manifest('issues', ['demo']),
    manifest('analysis', ['demo']),
    manifest('panels', []),
  ];

  it('★ 升一份共用依赖 → 声明它的**每一个**模块（不管动作是从哪一个发起的）', () => {
    expect(affectedUnitsOf(manifests, { action: 'update-dependency', id: 'plugin:demo' })).toEqual([
      'inventory',
      'issues',
      'analysis',
    ]);
    expect(affectedUnitsOf(manifests, { action: 'update-dependency', id: 'lib:opencli-workflow' })).toEqual(['inventory']);
  });

  it('★ 装 / 升 / 卸一个模块 → 自己 + 共用同一份安装的模块（观测不到的模块不许被漏掉）', () => {
    for (const action of ['install', 'update', 'uninstall'] as const) {
      expect(affectedUnitsOf(manifests, { action, unit: 'issues' })).toEqual([
        'issues',
        'inventory',
        'analysis',
      ]);
    }
  });

  it('没依赖的模块 / 认不出的 id / 认不出的动作 → 一个都不惊动（不猜）', () => {
    expect(affectedUnitsOf(manifests, { action: 'install', unit: 'panels' })).toEqual([]);
    expect(affectedUnitsOf(manifests, { action: 'install', unit: 'nope' })).toEqual([]);
    expect(affectedUnitsOf(manifests, { action: 'update-dependency', id: 'plugin:nope' })).toEqual([]);
    expect(affectedUnitsOf(manifests, { action: 'update-dependency', id: '坏形状' })).toEqual([]);
  });
});
