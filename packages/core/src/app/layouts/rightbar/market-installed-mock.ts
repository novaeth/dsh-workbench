import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { MarketMock } from './market-mock-types';

export function installedMocks(input: {
  readonly id: string;
  readonly found: UnitManifest;
  readonly mine: UnitManifest;
  readonly probe: (
    unit: string,
    status: CapabilityMap[string]['status'],
    extra?: Partial<CapabilityMap[string]>,
  ) => CapabilityMap;
}): readonly MarketMock[] {
  const { id, found, mine, probe } = input;
  return [
    {
      id: 'no-supply',
      label: '没有环境依赖的模块（供给是基座命令那种）：市场里有它这一行',
      manifests: [found],
      capabilities: probe(id, 'ok'),
      installed: [{ unit: id, pkg: '@dsh-workbench/module-one', installed: '0.1.2' }],
      expect: {
        rows: 1,
        state: 'installed',
        actions: ['uninstall'],
        installed: 0,
        shared: 0,
      },
    },
    {
      id: 'no-card',
      label: '没有卡片的模块（只有基座命令那种）：市场里有它这一行，有版本、有「更新」',
      manifests: [{ ...found, card: null }],
      capabilities: probe(id, 'ok'),
      updates: { [id]: { installed: '0.1.2', latest: '0.2.0' } },
      installed: [{ unit: id, pkg: '@dsh-workbench/module-one', installed: '0.1.2' }],
      expect: {
        rows: 1,
        state: 'outdated',
        actions: ['update-bundle', 'uninstall'],
        version: { installed: '0.1.2', latest: '0.2.0' },
        installed: 0,
        shared: 0,
      },
    },
    {
      id: 'no-env-installed',
      label: '本机装着、又没有依赖要探（DIY 本地那份那种）：写「已安装」，不是「状态未知」',
      manifests: [{ ...found, env: undefined }],
      capabilities: {},
      updates: { [id]: { installed: '0.1.2' } },
      installed: [{ unit: id, pkg: '@dsh-workbench/module-one', installed: '0.1.2' }],
      expect: {
        rows: 1,
        state: 'installed',
        actions: ['uninstall'],
        version: { installed: '0.1.2' },
        installed: 0,
      },
    },
    {
      id: 'local-no-update',
      label: '本机那份（link: 装的）：有「本地」标记、不给「更新」',
      manifests: [mine],
      capabilities: probe(id, 'ok', { plugins: [{ name: 'fixture', status: 'ok', missing: [] }] }),
      updates: { [id]: { installed: '0.1.0', local: true } },
      installed: [
        { unit: id, pkg: '@dsh-workbench/module-one', installed: '0.1.0', local: true },
      ],
      expect: {
        rows: 1,
        state: 'installed',
        actions: ['uninstall'],
        local: true,
        version: { installed: '0.1.0' },
        installed: 0,
      },
    },
    {
      id: 'installed-refused',
      label: '本机装了，但宿主不认它的声明（行上说得出理由）',
      manifests: [],
      capabilities: {},
      installed: [
        {
          unit: id,
          pkg: '@dsh-workbench/module-one',
          installed: '0.1.2',
          refused: ['dsh.workbench 缺 apiVersion —— 协议从 v1 起，写 "apiVersion": 1'],
        },
      ],
      expect: {
        rows: 0,
        installed: 1,
        installedState: 'unusable',
        installedActions: ['remove-bundle'],
        installedNote: true,
      },
    },
    {
      id: 'installed-pending',
      label: '本机装了、宿主还没加载它（重启一次就会出来）',
      manifests: [],
      capabilities: {},
      installed: [{ unit: id, pkg: '@dsh-workbench/module-one', installed: '0.1.2' }],
      expect: {
        rows: 0,
        installed: 1,
        installedState: 'inactive',
        installedActions: ['remove-bundle'],
        installedHint: 'panels.market.moduleRestartHint',
      },
    },
    {
      id: 'installed-pending-update',
      label: '本机装了、还没加载 + 源上有新版（给「更新」，也说明要重启）',
      manifests: [],
      capabilities: {},
      installed: [
        { unit: id, pkg: '@dsh-workbench/module-one', installed: '0.1.0', latest: '0.1.2' },
      ],
      expect: {
        rows: 0,
        installed: 1,
        installedState: 'outdated',
        installedActions: ['update-bundle', 'remove-bundle'],
        installedHint: 'panels.market.moduleRestartHint',
      },
    },
    {
      id: 'installed-confirm',
      label: '卸载本机模块（还没加载的那种：Modal 确认，标题是包名）',
      manifests: [],
      capabilities: {},
      installed: [{ unit: id, pkg: '@dsh-workbench/module-one', installed: '0.1.2' }],
      confirming: id,
      expect: {
        rows: 0,
        installed: 1,
        installedState: 'inactive',
        installedActions: ['remove-bundle'],
      },
    },
    {
      id: 'first-paint',
      label: '刚进页面（检测中：能力与本机清单都还没结论）',
      manifests: [mine],
      capabilities: null,
      installedRead: false,
      loaded: false,
      expect: { rows: 1, state: 'checking', actions: [] },
    },
  ];
}
