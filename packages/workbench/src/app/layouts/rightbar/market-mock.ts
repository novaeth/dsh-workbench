import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { installedMocks } from './market-installed-mock';
import type { MarketMock } from './market-mock-types';

export type { MarketMock, MarketMockExpect } from './market-mock-types';

function installable(manifest: UnitManifest): UnitManifest {
  return {
    ...manifest,
    env: { command: 'opencli', plugins: [{ name: 'fixture', commands: ['x'] }] },
  };
}

function withEnvSource(manifest: UnitManifest, env: string): UnitManifest {
  const [first, ...rest] = manifest.env?.plugins ?? [];
  if (first === undefined) return manifest;
  return {
    ...manifest,
    env: {
      ...manifest.env,
      plugins: [{ ...first, installSource: { kind: 'local', env } }, ...rest],
    },
  };
}

function withSecondNeed(manifest: UnitManifest): UnitManifest {
  return {
    ...manifest,
    env: {
      ...manifest.env,
      plugins: [...(manifest.env?.plugins ?? []), { name: 'fixture-second', commands: ['y'] }],
    },
  };
}

function twin(manifest: UnitManifest): UnitManifest {
  return { ...manifest, id: `${manifest.id}-b` };
}

function copies(manifest: UnitManifest, count: number): readonly UnitManifest[] {
  return Array.from({ length: count }, (_, index) => ({
    ...manifest,
    id: `${manifest.id}-${index}`,
    env: {
      ...manifest.env,
      plugins: [{ name: `fixture-${index}`, commands: manifest.env?.plugins?.[0]?.commands ?? [] }],
    },
  }));
}

function probe(
  unit: string,
  status: CapabilityMap[string]['status'],
  extra: Partial<CapabilityMap[string]> = {},
): CapabilityMap {
  return { [unit]: { unit, status, required: ['x'], missing: [], detail: '夹具', ...extra } };
}

export function buildMarketMocks(roster: readonly UnitManifest[]): readonly MarketMock[] {
  const found = roster.find((manifest) => manifest.card !== null);
  if (found === undefined) {
    return [{ id: 'empty', label: '市场空态', manifests: [], capabilities: {}, expect: { rows: 0 } }];
  }
  const mine = installable(found);
  const second = twin(mine);
  const id = mine.id;
  const secondId = second.id;

  return [
    {
      id: 'installed',
      label: '已装',
      manifests: [mine],
      capabilities: probe(id, 'ok', { plugins: [{ name: 'fixture', status: 'ok', missing: [] }] }),
      expect: { rows: 1, state: 'installed', actions: ['uninstall'], shared: 1, sharedActions: [] },
    },
    {
      id: 'outdated',
      label: '要更新',
      manifests: [mine],
      capabilities: probe(id, 'missing-commands', { missing: ['x'] }),
      expect: {
        rows: 1,
        state: 'outdated',
        actions: ['update', 'uninstall'],
        noteKey: 'panels.market.needCommands',
      },
    },
    {
      id: 'module-update',
      label: '模块包有新版（行上给「更新」，装了要重启）',
      manifests: [mine],
      capabilities: probe(id, 'ok', { plugins: [{ name: 'fixture', status: 'ok', missing: [] }] }),
      updates: { [id]: { installed: '0.1.2', latest: '0.2.0' } },
      expect: {
        rows: 1,
        state: 'outdated',
        actions: ['update-bundle', 'uninstall'],
        shared: 1,
        sharedActions: [],
      },
    },
    {
      id: 'outdated-release',
      label: '源上有新版（模块行不变，共用依赖行给「更新」）',
      manifests: [mine],
      capabilities: probe(id, 'ok', {
        plugins: [
          {
            name: 'fixture',
            status: 'outdated',
            missing: [],
            release: { installed: '1.0.16', latest: '1.0.17' },
          },
        ],
      }),
      expect: { rows: 1, state: 'installed', actions: ['uninstall'], shared: 1, sharedActions: ['update-dependency'] },
    },
    {
      id: 'missing',
      label: '未装（可装）',
      manifests: [mine],
      capabilities: probe(id, 'missing-plugin', {
        install: 'ready',
        plugins: [{ name: 'fixture', status: 'missing', missing: ['x'], install: 'ready' }],
      }),
      expect: { rows: 1, state: 'missing', actions: ['install'], shared: 1, sharedActions: [] },
    },
    {
      id: 'missing-env',
      label: '未装 + 要先设环境变量',
      manifests: [withEnvSource(mine, 'WB_FIXTURE_HOME')],
      capabilities: probe(id, 'missing-plugin', { install: 'env-missing' }),
      expect: { rows: 1, state: 'missing', actions: [] },
    },
    {
      id: 'missing-undeclared',
      label: '未装 + 没声明怎么装',
      manifests: [mine],
      capabilities: probe(id, 'missing-plugin', { install: 'not-declared' }),
      expect: { rows: 1, state: 'missing', actions: [] },
    },
    {
      id: 'unknown',
      label: '探测失败（状态未知）',
      manifests: [mine],
      capabilities: {},
      expect: { rows: 1, state: 'unknown', actions: [] },
    },
    {
      id: 'checking',
      label: '检测中',
      manifests: [mine],
      capabilities: null,
      expect: { rows: 1, state: 'checking', actions: [] },
    },
    {
      id: 'shared',
      label: '两个模块（第二行是复制的）',
      manifests: [mine, second],
      capabilities: { ...probe(id, 'ok'), ...probe(secondId, 'ok') },
      expect: { rows: 2, state: 'installed', actions: ['uninstall'], shared: 1 },
    },
    {
      id: 'busy',
      label: '正在装',
      manifests: [mine],
      capabilities: probe(id, 'missing-plugin', { install: 'ready' }),
      pending: { id, action: 'install' },
      expect: { rows: 1, state: 'missing', actions: ['install'] },
    },
    {
      id: 'confirm',
      label: '等确认卸载',
      manifests: [mine],
      capabilities: probe(id, 'ok'),
      confirming: id,
      expect: { rows: 1, state: 'installed', actions: ['uninstall'] },
    },
    {
      id: 'failed',
      label: '失败（红字贴行）',
      manifests: [mine],
      capabilities: probe(id, 'ok'),
      failure: { id, message: '没成功：命令失败（退出码 1）：夹具里的一条失败原因' },
      expect: { rows: 1, state: 'installed', actions: ['uninstall'] },
    },
    {
      id: 'long-title',
      label: '超长模块名',
      manifests: [
        { ...mine, card: { titleKey: '一个名字特别特别长的模块用来验证省略号会不会把按钮挤下去', order: 10 } },
      ],
      capabilities: probe(id, 'ok'),
      expect: { rows: 1, state: 'installed', actions: ['uninstall'], titleChars: 25 },
    },
    {
      id: 'long-env',
      label: '超长环境变量名',
      manifests: [withEnvSource(mine, 'DSH_WORKBENCH_SOMETHING_VERY_LONG_ENV_NAME_FOR_THE_MODULE')],
      capabilities: probe(id, 'missing-plugin', { install: 'env-missing' }),
      expect: { rows: 1, state: 'missing', actions: [] },
    },
    {
      id: 'long-error',
      label: '超长错误信息',
      manifests: [mine],
      capabilities: probe(id, 'ok'),
      failure: {
        id,
        message:
          '没成功：命令失败（退出码 1）：Error: EPERM: operation not permitted, unlink ' +
          "'/Users/someone/.dsh/workbench/opencli/home/.opencli/plugins/acme-permission-copy-with-a-very-long-directory-name'",
      },
      expect: { rows: 1, state: 'installed', actions: ['uninstall'] },
    },
    {
      id: 'two-deps',
      label: '两份依赖（只装缺的）',
      manifests: [withSecondNeed(mine)],
      capabilities: probe(id, 'missing-plugin', {
        install: 'ready',
        plugins: [
          { name: 'fixture', status: 'ok', missing: [] },
          { name: 'fixture-second', status: 'missing', missing: ['y'], install: 'ready' },
        ],
      }),
      expect: { rows: 1, state: 'missing', actions: ['install'] },
    },
    {
      id: 'many',
      label: '很多行（要滚）',
      manifests: [mine, ...copies(mine, 13)],
      capabilities: Object.fromEntries(
        [id, ...copies(mine, 13).map((item) => item.id)].map((unit) => [unit, probe(unit, 'ok')[unit]]),
      ),
      expect: { rows: 14, state: 'installed', actions: ['uninstall'] },
    },
    ...installedMocks({ id, found, mine, probe }),
    {
      id: 'shared-many',
      label: '三个模块（同一份安装）',
      manifests: [mine, twin(mine), { ...twin(mine), id: `${mine.id}-c` }],
      capabilities: {
        ...probe(id, 'ok'),
        ...probe(secondId, 'ok'),
        ...probe(`${mine.id}-c`, 'ok'),
      },
      expect: { rows: 3, state: 'installed', actions: ['uninstall'] },
    },
    {
      id: 'plugin-outdated',
      label: '用户装的 opencli 插件：有新版（给更新 / 卸载）',
      manifests: [],
      capabilities: {},
      plugins: [{ pkg: 'opencli-plugin-inventory', name: 'inventory', installed: '1.0.24', latest: '1.0.25' }],
      expect: { rows: 0, plugins: 1, pluginActions: ['update-plugin', 'uninstall-plugin'] },
    },
    {
      id: 'plugin-local',
      label: '本地目录装的 opencli 插件：没有版本源，只给卸载',
      manifests: [],
      capabilities: {},
      plugins: [{ pkg: '/Users/me/my-local-plugin', name: 'my-local-plugin', local: true }],
      expect: { rows: 0, plugins: 1, pluginActions: ['uninstall-plugin'], pluginNote: false },
    },
    {
      id: 'plugin-alias',
      label: '插件名 ≠ 包名：行上两个都写出来（更新 / 卸载按包名）',
      manifests: [],
      capabilities: {},
      plugins: [{ pkg: 'opencli-plugin-inventory', name: 'inventory', installed: '1.0.24', latest: '1.0.25' }],
      expect: { rows: 0, plugins: 1, pluginActions: ['update-plugin', 'uninstall-plugin'] },
    },
    {
      id: 'plugin-broken',
      label: '装坏了的那一份（目录在但看不出是个插件）：行上直说，给卸载与指路',
      manifests: [],
      capabilities: {},
      plugins: [{ pkg: 'opencli-plugin-inventory', name: 'inventory', installed: '1.0.24', broken: true }],
      expect: {
        rows: 0,
        plugins: 1,
        pluginState: 'broken',
        pluginActions: ['uninstall-plugin'],
        pluginNoteKey: 'panels.market.pluginBroken',
      },
    },
    {
      id: 'plugin-kept',
      label: '卸掉用户装的插件，但还有模块在用：文件先留着（行上给一句为什么）',
      manifests: [],
      capabilities: {},
      plugins: [{ pkg: 'opencli-plugin-inventory', name: 'inventory', installed: '1.0.24' }],
      notice: '文件先留着：inventory、deploy 还要用它。',
      expect: { rows: 0, plugins: 1, pluginActions: ['uninstall-plugin'], notice: true },
    },
    {
      id: 'workbench-update',
      label: '工作台有新版（这一行也给「更新」，装完面板自己换上）',
      manifests: [],
      capabilities: {},
      workbench: { pkg: '@dsh-workbench/core', installed: '0.1.18', latest: '0.1.19' },
      expect: { rows: 0, workbenchState: 'outdated', workbenchActions: ['update-workbench'] },
    },
    {
      id: 'workbench-current',
      label: '工作台已经最新（只显示版本，没有按钮）',
      manifests: [],
      capabilities: {},
      workbench: { pkg: '@dsh-workbench/core', installed: '0.1.19' },
      expect: { rows: 0, workbenchState: 'installed', workbenchActions: [] },
    },
    {
      id: 'workbench-local',
      label: '工作台是本仓那份（link: 装的：不给更新，行上说清）',
      manifests: [],
      capabilities: {},
      workbench: { pkg: '@dsh-workbench/core', installed: '0.1.18', latest: '0.1.19', local: true },
      expect: {
        rows: 0,
        workbenchState: 'installed',
        workbenchActions: [],
        workbenchNoteKey: 'panels.market.workbenchLocal',
      },
    },
    {
      id: 'workbench-updated',
      label: '工作台刚更新完（新版已经在盘上：行上就是新版，没有按钮、也不劝人重启）',
      manifests: [],
      capabilities: {},
      workbench: { pkg: '@dsh-workbench/core', installed: '0.1.19' },
      expect: {
        rows: 0,
        workbenchState: 'installed',
        workbenchActions: [],
      },
    },
    {
      id: 'workbench-restart-pending',
      label: '工作台更新完了但这份进程里还是旧的（盘上 0.1.19、跑着的 0.1.18：状态那格是红点「重启后生效」——重启一次 dsh 才真的换上）',
      manifests: [],
      capabilities: {},
      workbench: { pkg: '@dsh-workbench/core', installed: '0.1.19', running: '0.1.18' },
      expect: { rows: 0, workbenchState: 'pending-restart', workbenchActions: [] },
    },
    {
      id: 'workbench-restart-pending-local',
      label: '本仓那份（link: 装的）永远等于盘上那份 → 不亮这句、也不劝重启',
      manifests: [],
      capabilities: {},
      workbench: {
        pkg: '@dsh-workbench/core',
        installed: '0.1.19',
        running: '0.1.18',
        local: true,
      },
      expect: { rows: 0, workbenchState: 'installed', workbenchActions: [] },
    },
    {
      id: 'empty',
      label: '市场空态',
      manifests: [],
      capabilities: {},
      expect: { rows: 0, shared: 0 },
    },
  ];
}
