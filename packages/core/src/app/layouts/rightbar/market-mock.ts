import type {
  CapabilityPayload,
  ExtensionNeed,
  Need,
  NeedState,
  UnitManifest,
} from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { installedMocks } from './market-installed-mock';
import type { MarketMock } from './market-mock-types';
import { binInstallMocks, failureCardMocks } from './market-failure-mock';

export type { MarketMock, MarketMockExpect } from './market-mock-types';

type FixtureNeedState = {
  readonly name: string;
  readonly status: NeedState['status'];
  readonly missing?: readonly string[];
  readonly provision?: NeedState['provision'];
  readonly release?: { readonly installed?: string; readonly latest?: string };
};

type FixturePatch = Partial<CapabilityMap[string]> & {
  readonly plugins?: readonly FixtureNeedState[];
  readonly provision?: NeedState['provision'];
  readonly missing?: readonly string[];
};

function needOf(state: FixtureNeedState, index: number): NeedState {
  return {
    id: `extension:${state.name}`,
    kind: 'extension',
    name: state.name,
    status: state.status,
    detail: `夹具：${state.name}`,
    ...(state.missing === undefined ? {} : { missing: state.missing }),
    ...(state.provision === undefined ? {} : { provision: state.provision }),
    ...(state.release?.installed === undefined ? {} : { installed: state.release.installed }),
    ...(state.release?.latest === undefined ? {} : { latest: state.release.latest }),
    ...(index === 0 && state.provision === 'ready' ? { command: 'opencli plugin install <fixture>' } : {}),
  };
}

function installable(manifest: UnitManifest): UnitManifest {
  return {
    ...manifest,
    needs: [
      {
        kind: 'extension',
        runtime: 'opencli',
        name: 'fixture',
        commands: ['x'],
        purpose: '夹具',
        sources: [
          {
            kind: 'npm',
            package: 'acme-plugin-fixture',
            registryEnv: 'WB_FIXTURE_REGISTRY',
            registryDefault: 'https://registry.invalid/',
          },
        ],
      },
    ],
  };
}

function withEnvSource(manifest: UnitManifest, env: string): UnitManifest {
  const needs = manifest.needs ?? [];
  const [first, ...rest] = needs;
  if (first === undefined || first.kind !== 'extension') return manifest;
  return {
    ...manifest,
    needs: [{ ...first, sources: [{ kind: 'local', env }] }, ...rest],
  };
}

function withSecondNeed(manifest: UnitManifest): UnitManifest {
  const second: Need = { kind: 'extension', runtime: 'opencli', name: 'fixture-second', commands: ['y'], purpose: '夹具' };
  return { ...manifest, needs: [...(manifest.needs ?? []), second] };
}

function twin(manifest: UnitManifest): UnitManifest {
  return { ...manifest, id: `${manifest.id}-b` };
}

function copies(manifest: UnitManifest, count: number): readonly UnitManifest[] {
  return Array.from({ length: count }, (_, index) => {
    const first = (manifest.needs ?? []).find(
      (need): need is ExtensionNeed => need.kind === 'extension',
    );
    return {
      ...manifest,
      id: `${manifest.id}-${index}`,
      needs: [
        {
          kind: 'extension' as const,
          runtime: 'opencli',
          name: `fixture-${index}`,
          commands: first?.commands ?? [],
          purpose: '夹具',
        },
      ],
    };
  });
}

function probe(unit: string, status: string, patch: FixturePatch = {}): CapabilityMap {
  const legacy = patch.plugins ?? [];
  const needs =
    legacy.length > 0
      ? legacy.map((state, index) => needOf(state, index))
      : patch.missing !== undefined || patch.provision !== undefined
        ? [
            {
              id: 'extension:fixture',
              kind: 'extension' as const,
              name: 'fixture',
              status: status as CapabilityPayload['status'] === 'outdated' ? ('outdated' as const) : ('missing' as const),
              detail: '夹具',
              ...(patch.missing === undefined ? {} : { missing: [...patch.missing] }),
              ...(patch.provision === undefined ? {} : { provision: patch.provision }),
            },
          ]
        : [];
  const { plugins: _plugins, provision: _provision, missing: _missing, ...rest } = patch;
  return {
    [unit]: { unit, status: status as CapabilityPayload['status'], needs, detail: '夹具', ...rest },
  };
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
      capabilities: probe(id, 'outdated', { missing: ['x'] }),
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
      label: '源上有新版（need outdated，模块行与共用依赖行都给「更新」）',
      manifests: [mine],
      capabilities: probe(id, 'outdated', {
        plugins: [
          {
            name: 'fixture',
            status: 'outdated',
            missing: [],
            release: { installed: '1.0.16', latest: '1.0.17' },
          },
        ],
      }),
      expect: { rows: 1, state: 'outdated', actions: ['update', 'uninstall'], shared: 1, sharedActions: ['update-dependency'] },
    },
    {
      id: 'missing',
      label: '未装（可装）',
      manifests: [mine],
      capabilities: probe(id, 'missing', {
        provision: 'ready',
        plugins: [{ name: 'fixture', status: 'missing', missing: ['x'], provision: 'ready' }],
      }),
      expect: { rows: 1, state: 'missing', actions: ['install'], shared: 1, sharedActions: [] },
    },
    {
      id: 'missing-env',
      label: '未装 + 要先设环境变量',
      manifests: [withEnvSource(mine, 'WB_FIXTURE_HOME')],
      capabilities: probe(id, 'missing', { provision: 'env-missing' }),
      expect: { rows: 1, state: 'missing', actions: [] },
    },
    {
      id: 'missing-undeclared',
      label: '未装 + 没声明怎么装',
      manifests: [mine],
      capabilities: probe(id, 'missing', { provision: 'not-declared' }),
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
      capabilities: probe(id, 'missing', { provision: 'ready' }),
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
    ...failureCardMocks({ id, mine, probe }),
    ...binInstallMocks({ id, mine }),
    {
      id: 'long-title',
      label: '超长模块名',
      manifests: [
        { ...mine, titleKey: '一个名字特别特别长的模块用来验证省略号会不会把按钮挤下去', card: { order: 10 } },
      ],
      capabilities: probe(id, 'ok'),
      expect: { rows: 1, state: 'installed', actions: ['uninstall'], titleChars: 25 },
    },
    {
      id: 'long-env',
      label: '超长环境变量名',
      manifests: [withEnvSource(mine, 'DSH_WORKBENCH_SOMETHING_VERY_LONG_ENV_NAME_FOR_THE_MODULE')],
      capabilities: probe(id, 'missing', { provision: 'env-missing' }),
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
      capabilities: probe(id, 'missing', {
        provision: 'ready',
        plugins: [
          { name: 'fixture', status: 'ok', missing: [] },
          { name: 'fixture-second', status: 'missing', missing: ['y'], provision: 'ready' },
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
      plugins: [{ pkg: 'acme-plugin-inventory', name: 'inventory', installed: '1.0.24', latest: '1.0.25' }],
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
      plugins: [{ pkg: 'acme-plugin-inventory', name: 'inventory', installed: '1.0.24', latest: '1.0.25' }],
      expect: { rows: 0, plugins: 1, pluginActions: ['update-plugin', 'uninstall-plugin'] },
    },
    {
      id: 'plugin-broken',
      label: '装坏了的那一份（目录在但看不出是个插件）：行上直说，给卸载与指路',
      manifests: [],
      capabilities: {},
      plugins: [{ pkg: 'acme-plugin-inventory', name: 'inventory', installed: '1.0.24', broken: true }],
      expect: {
        rows: 0,
        plugins: 1,
        pluginState: 'broken',
        pluginActions: ['uninstall-plugin'],
        pluginNoteKey: 'panels.market.pluginBroken',
      },
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
      label: '工作台是源码目录那份（link: 装的：不给更新，行上打「本地」）',
      manifests: [],
      capabilities: {},
      workbench: { pkg: '@dsh-workbench/core', installed: '0.1.18', latest: '0.1.19', local: true },
      expect: {
        rows: 0,
        workbenchState: 'installed',
        workbenchActions: [],
        workbenchLocal: true,
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
      label: '工作台更新完了但这份进程里还是旧的（盘上 0.1.19、跑着的 0.1.18：状态那格是黄点「重启后生效」——重启一次 dsh 才真的换上）',
      manifests: [],
      capabilities: {},
      workbench: { pkg: '@dsh-workbench/core', installed: '0.1.19', running: '0.1.18' },
      expect: { rows: 0, workbenchState: 'pending-restart', workbenchActions: [] },
    },
    {
      id: 'workbench-migrate-pending',
      label: '工作台：旧数据待迁移（迁移 / 不再提醒都有二次确认）',
      manifests: [],
      capabilities: {},
      workbench: {
        pkg: '@dsh-workbench/core',
        installed: '0.1.19',
        followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false },
      },
      expect: {
        rows: 0,
        workbenchState: 'pending-followup',
        workbenchActions: ['migrate-workbench', 'dismiss-followup'],
      },
    },
    {
      id: 'workbench-migrating',
      label: '工作台：迁移中（行内转圈、按钮禁用）',
      manifests: [],
      capabilities: {},
      pending: { id: 'workbench:self', action: 'migrate-workbench' },
      workbench: {
        pkg: '@dsh-workbench/core',
        installed: '0.1.19',
        followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false },
      },
      expect: {
        rows: 0,
        workbenchState: 'pending-followup',
        workbenchActions: ['migrate-workbench', 'dismiss-followup'],
      },
    },
    {
      id: 'workbench-followup-hard',
      label: '工作台：硬性待办（只给迁移，没有不再提醒）',
      manifests: [],
      capabilities: {},
      workbench: {
        pkg: '@dsh-workbench/core',
        installed: '0.1.19',
        followUp: { id: 'data-root-migration', kind: 'data-migration', hard: true },
      },
      expect: {
        rows: 0,
        workbenchState: 'pending-followup',
        workbenchActions: ['migrate-workbench'],
      },
    },
    {
      id: 'workbench-restart-pending-local',
      label: '源码目录那份（link: 装的）永远等于盘上那份 → 不亮这句、也不劝重启',
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
