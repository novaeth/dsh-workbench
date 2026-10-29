import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { PanelPluginUnit, PanelUnit } from './use-panels';

export interface PanelMockExpect {
  readonly rows: number;
  readonly badge?: string | null;
  readonly on?: boolean;
}

export interface PanelMock {
  readonly id: string;
  readonly label: string;
  readonly units: readonly PanelUnit[];
  readonly plugins?: readonly PanelPluginUnit[];
  readonly capabilities: CapabilityMap | null;
  readonly busy?: boolean;
  readonly failed?: boolean;
  readonly drag?:
    | {
        readonly from: number;
        readonly over: number | null;
        readonly at?: { readonly x: number; readonly y: number };
      }
    | undefined;
  readonly expect: PanelMockExpect;
}

function row(id: string, titleKey: string, shown: boolean): PanelUnit {
  return { id, titleKey, shown, source: 'user', hasCard: true };
}

function noCardRow(id: string, titleKey: string): PanelUnit {
  return { id, titleKey, shown: false, source: 'user', hasCard: false };
}

function plugin(id: string, pkg: string, title: string, shown: boolean): PanelPluginUnit {
  return { id, pkg, title, shown, source: 'user' };
}

const PLUGIN_MOCK: PanelMock = {
  id: 'plugin',
  label: 'opencli 插件行（标出是插件，能开能关）',
  units: [],
  plugins: [
    plugin('plugin:acme-plugin-inventory', 'acme-plugin-inventory', 'inventory', true),
    plugin('plugin:acme-plugin-notes', 'acme-plugin-notes', 'notes', false),
  ],
  capabilities: {},
  expect: { rows: 0 },
};

function probe(unit: string, status: string): CapabilityMap {
  const mapped = status as CapabilityMap[string]['status'];
  const needs =
    mapped === 'ok' || mapped === 'unchecked'
      ? []
      : [
          {
            id: 'extension:fixture',
            kind: 'extension' as const,
            name: 'fixture',
            status: mapped === 'outdated' ? ('outdated' as const) : ('missing' as const),
            detail: '夹具',
          },
        ];
  return { [unit]: { unit, status: mapped, needs, detail: '夹具' } };
}

export function buildPanelMocks(roster: readonly UnitManifest[]): readonly PanelMock[] {
  const found = roster.find((manifest) => manifest.card !== null);
  if (found === undefined) {
    return [
      {
        id: 'empty',
        label: '列表空（都卸了/都关了）',
        units: [],
        capabilities: {},
        expect: { rows: 0 },
      },
      PLUGIN_MOCK,
    ];
  }

  const titleKey = found.titleKey;
  const id = found.id;
  const on = row(id, titleKey, true);
  const off = row(id, titleKey, false);
  const twin = row(`${id}-b`, titleKey, true);
  const third = row(`${id}-c`, titleKey, false);

  return [
    {
      id: 'one',
      label: '一行：已启用、装好了',
      units: [on],
      capabilities: probe(id, 'ok'),
      expect: { rows: 1, badge: null, on: true },
    },
    {
      id: 'off',
      label: '已停用（开关关着）',
      units: [off],
      capabilities: probe(id, 'ok'),
      expect: { rows: 1, badge: null, on: false },
    },
    {
      id: 'missing',
      label: '⚠ 没装好 → 不列（去市场装）',
      units: [on],
      capabilities: probe(id, 'missing'),
      expect: { rows: 0 },
    },
    {
      id: 'outdated',
      label: '⚠ 缺命令（也没装好）→ 同样不列',
      units: [on],
      capabilities: probe(id, 'outdated'),
      expect: { rows: 0 },
    },
    {
      id: 'unchecked',
      label: '⚠ 检测不了',
      units: [on],
      capabilities: probe(id, 'unchecked'),
      expect: { rows: 1, badge: 'panels.dep.unchecked', on: true },
    },
    {
      id: 'checking',
      label: '还没探到（没有徽标）',
      units: [on],
      capabilities: null,
      expect: { rows: 1, badge: null, on: true },
    },
    {
      id: 'many',
      label: '三行（顺序 / 停用混着）',
      units: [on, twin, third],
      capabilities: { ...probe(id, 'ok'), ...probe(`${id}-b`, 'ok'), ...probe(`${id}-c`, 'ok') },
      expect: { rows: 3, badge: null, on: true },
    },
    {
      id: 'no-card',
      label: '没看板的模块（只有基座命令那种）：也列出来、带「无看板」标签，开关照常能用，只是不参与排序',
      units: [on, noCardRow(`${id}-c`, `${titleKey}（无看板）`)],
      capabilities: { ...probe(id, 'ok'), ...probe(`${id}-c`, 'ok') },
      expect: { rows: 2, badge: null, on: true },
    },
    {
      id: 'long',
      label: '超长模块名',
      units: [row(id, '一个名字特别特别长的模块用来验证省略号会不会把开关挤下去', true)],
      capabilities: probe(id, 'ok'),
      expect: { rows: 1, badge: null },
    },
    {
      id: 'hidden',
      label: '卸载后不显示（未启用 + 没装）',
      units: [off],
      capabilities: probe(id, 'missing'),
      expect: { rows: 0 },
    },
    {
      id: 'busy',
      label: '正在改配置（开关禁用）',
      units: [on, twin],
      capabilities: { ...probe(id, 'ok'), ...probe(`${id}-b`, 'ok') },
      busy: true,
      expect: { rows: 2 },
    },
    {
      id: 'failed',
      label: '改配置失败（红字）',
      units: [on],
      capabilities: probe(id, 'ok'),
      failed: true,
      expect: { rows: 1 },
    },
    {
      id: 'drag',
      label: '拖动中的落点提示',
      units: [on, twin, third],
      capabilities: { ...probe(id, 'ok'), ...probe(`${id}-b`, 'ok'), ...probe(`${id}-c`, 'ok') },
      drag: { from: 1, over: 0, at: { x: 1230, y: 300 } },
      expect: { rows: 3, on: true },
    },
    {
      id: 'drag-off',
      label: '拖到未开启的那一行上：落点不亮（松手也不动）',
      units: [on, twin, third],
      capabilities: { ...probe(id, 'ok'), ...probe(`${id}-b`, 'ok'), ...probe(`${id}-c`, 'ok') },
      drag: { from: 0, over: null, at: { x: 1230, y: 300 } },
      expect: { rows: 3, on: true },
    },
    PLUGIN_MOCK,
  ];
}
