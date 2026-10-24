import { describe, expect, it } from 'vitest';
import type { BoardModule } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import {
  aggregateSummaries,
  available,
  panelBadgeKey,
  panelDropTarget,
  rowAtPoint,
  selectBoardModules,
  selectPanelRows,
  selectPanelUnits,
} from '../board-selection';

function module(id: string): BoardModule {
  return {
    id,
    titleKey: `${id}.title`,
    order: 10,
    View: () => null,
  };
}

const MODULES = [module('issues'), module('ci')];
const byId = (id: string): BoardModule | undefined => MODULES.find((item) => item.id === id);

function capability(status: CapabilityMap[string]['status'], extra: Partial<CapabilityMap[string]> = {}): CapabilityMap[string] {
  return { unit: 'issues', status, required: [], missing: [], detail: '假探测', ...extra };
}

const map = (value: CapabilityMap[string]): CapabilityMap => ({ issues: value, ci: { ...value, unit: 'ci' } });

describe('available（能不能上板 / 能不能进候选）', () => {
  it('装好了 / 探不动 / 还没探到 → 能', () => {
    expect(available(undefined)).toBe(true);
    expect(available(capability('ok'))).toBe(true);
    expect(available(capability('unchecked'))).toBe(true);
  });

  it('★ 起不来（宿主挂它这份面时抛了）→ **照画**（卡片带着"起不来 + 原因"的阻断态，而不是静默消失）', () => {
    expect(available(capability('failed'))).toBe(true);
    expect(selectBoardModules([{ id: 'issues', shown: true }], byId, map(capability('failed')))).toHaveLength(1);
  });

  it('★ 没装好（缺插件 / 缺命令）→ 不能；卸载过（released）→ 不能', () => {
    expect(available(capability('missing-plugin'))).toBe(false);
    expect(available(capability('missing-commands'))).toBe(false);
    expect(available(capability('ok', { released: true }))).toBe(false);
  });
});

describe('panelBadgeKey（模块页那一行的角标）', () => {
  it('起不来与没装好、检测不了各有各的说法（不是一个笼统的"不可用"）', () => {
    expect(panelBadgeKey(capability('failed'))).toBe('panels.dep.failed');
    expect(panelBadgeKey(capability('missing-plugin'))).toBe('panels.dep.missingPlugin');
    expect(panelBadgeKey(capability('missing-commands'))).toBe('panels.dep.missingCommands');
    expect(panelBadgeKey(capability('unchecked'))).toBe('panels.dep.unchecked');
    expect(panelBadgeKey(capability('ok'))).toBeUndefined();
    expect(panelBadgeKey(undefined)).toBeUndefined();
  });
});

describe('selectPanelRows（面板配置那一列的行）', () => {
  it('★ 无看板的模块照样成一行，但 hasCard=false 跟着走（界面据此不画拖柄与开关）', () => {
    const rows = selectPanelRows(
      [
        { id: 'inventory', titleKey: 'inventory.title', shown: true, source: 'user', hasCard: true },
        { id: 'delivery', titleKey: 'delivery', shown: false, source: 'user', hasCard: false },
      ],
      [],
      null,
    );

    expect(rows.map((row) => [row.id, row.hasCard])).toEqual([
      ['inventory', true],
      ['delivery', false],
    ]);
  });

  it('★ 同一个插件只画一行：单元那份里的 plugin:<包名> 与台账那一笔是同一个 id（同一笔状态），只留标题像样的插件行', () => {
    const rows = selectPanelRows(
      [
        { id: 'inventory', titleKey: 'inventory.title', shown: true, source: 'user', hasCard: true },
        {
          id: 'plugin:opencli-plugin-dashboards',
          titleKey: 'plugin:opencli-plugin-dashboards',
          shown: false,
          source: 'default',
          hasCard: false,
        },
      ],
      [
        {
          id: 'plugin:opencli-plugin-dashboards',
          pkg: 'opencli-plugin-dashboards',
          title: 'dashboards',
          shown: false,
          source: 'default',
        },
      ],
      null,
    );

    expect(rows.map((row) => row.id)).toEqual(['inventory', 'plugin:opencli-plugin-dashboards']);
    expect(rows[1]).toMatchObject({ plugin: true, title: 'dashboards' });
  });
});

describe('panelDropTarget（拖动排序时哪一行能当落点）', () => {
  const rows = [{ shown: true }, { shown: false }, { shown: true }];

  it('开着的那一行就是它自己的下标（它就是交给 move 的那个位置）', () => {
    expect(panelDropTarget(rows, 0)).toBe(0);
    expect(panelDropTarget(rows, 2)).toBe(2);
  });

  it('★ 没开的那一行不是落点（不亮高亮条、光标给禁用、松手不动）', () => {
    expect(panelDropTarget(rows, 1)).toBeNull();
  });

  it('没有这一行（列表外）也不是落点', () => {
    expect(panelDropTarget(rows, 3)).toBeNull();
    expect(panelDropTarget([], 0)).toBeNull();
    expect(panelDropTarget(rows, null)).toBeNull();
  });

  it('★ 无看板的那一行也不当落点（它排在带卡片的后面、不参与排序）', () => {
    expect(panelDropTarget([{ shown: true, hasCard: false }], 0)).toBeNull();
    expect(panelDropTarget([{ shown: true, hasCard: true }], 0)).toBe(0);
  });
});

describe('rowAtPoint（光标纵坐标落在哪一行：行自己的框 + 它与下一行之间的缝）', () => {
  const boxes = [
    { top: 0, bottom: 36 },
    { top: 38, bottom: 74 },
    { top: 76, bottom: 112 },
  ];

  it('行内命中它自己', () => {
    expect(rowAtPoint(boxes, 0)).toBe(0);
    expect(rowAtPoint(boxes, 35)).toBe(0);
    expect(rowAtPoint(boxes, 50)).toBe(1);
    expect(rowAtPoint(boxes, 100)).toBe(2);
  });

  it('★ 两行之间那 2px 的缝算上面那行（缝里也要有落点，否则亮条会闪）', () => {
    expect(rowAtPoint(boxes, 36)).toBe(0);
    expect(rowAtPoint(boxes, 37)).toBe(0);
    expect(rowAtPoint(boxes, 75)).toBe(1);
  });

  it('★ 第一行之上 / 最后一行之下都不算落点（拖出去就是取消）', () => {
    expect(rowAtPoint(boxes, -1)).toBeNull();
    expect(rowAtPoint(boxes, 113)).toBeNull();
    expect(rowAtPoint([], 10)).toBeNull();
  });
});

describe('selectBoardModules', () => {
  it('配置说开就渲染（即使清单里默认是关的）', () => {
    const picked = selectBoardModules([{ id: 'issues', shown: true }], byId, map(capability('ok')));

    expect(picked.map((item) => item.id)).toEqual(['issues']);
  });

  it('配置说关就不渲染', () => {
    expect(selectBoardModules([{ id: 'issues', shown: false }], byId, map(capability('ok')))).toEqual([]);
  });

  it('按投影给的顺序渲染（那就是用户拖过的顺序）', () => {
    const picked = selectBoardModules(
      [
        { id: 'ci', shown: true },
        { id: 'issues', shown: true },
      ],
      byId,
      map(capability('ok')),
    );

    expect(picked.map((item) => item.id)).toEqual(['ci', 'issues']);
  });

  it('还没读到配置 → 渲染空（不用默认值兜底，避免闪出错的卡片）', () => {
    expect(selectBoardModules(null, byId, map(capability('ok')))).toEqual([]);
  });

  it('配置里有、但注册表里没有这个 id → 跳过（不炸）', () => {
    expect(selectBoardModules([{ id: 'nope', shown: true }], byId, map(capability('ok')))).toEqual([]);
  });

  it('★ 配置里开着、但**没装好** → 不画（口径：没装 = 不能用，ADR-0016）', () => {
    expect(selectBoardModules([{ id: 'issues', shown: true }], byId, map(capability('missing-plugin')))).toEqual([]);
    expect(selectBoardModules([{ id: 'issues', shown: true }], byId, map(capability('missing-commands')))).toEqual([]);
    expect(selectBoardModules([{ id: 'issues', shown: true }], byId, map(capability('ok', { released: true })))).toEqual([]);
  });

  it('★ 探不动 / 还没探到 → **照画**（一次探测失败不许把板子弄空）', () => {
    expect(selectBoardModules([{ id: 'issues', shown: true }], byId, map(capability('unchecked')))).toHaveLength(1);
    expect(selectBoardModules([{ id: 'issues', shown: true }], byId, null)).toHaveLength(1);
    expect(selectBoardModules([{ id: 'issues', shown: true }], byId, {})).toHaveLength(1);
  });
});

describe('aggregateSummaries（头部两个字段：套件之间不许互相影响）', () => {
  it('没有任何模块上报 → 不转圈、没有时间', () => {
    expect(aggregateSummaries([])).toEqual({ refreshing: false, at: null });
  });

  it('只要有**一个**在刷就算在刷（用户看到"有东西在动"）', () => {
    const result = aggregateSummaries([
      { refreshing: false, at: 100 },
      { refreshing: true, at: 200 },
    ]);

    expect(result.refreshing).toBe(true);
  });

  it('时间取**最新**那份，且**与上报顺序无关**', () => {
    const a = { refreshing: false, at: 100 };
    const b = { refreshing: false, at: 300 };
    const c = { refreshing: false, at: 200 };

    expect(aggregateSummaries([a, b, c])).toEqual({ refreshing: false, at: 300 });
    expect(aggregateSummaries([c, b, a])).toEqual(aggregateSummaries([a, b, c]));
  });

  it('有的模块还没有数据（at 为 null）→ 忽略它，而不是把时间变成"没有"', () => {
    const result = aggregateSummaries([
      { refreshing: false, at: null },
      { refreshing: false, at: 42 },
    ]);

    expect(result.at).toBe(42);
  });

  it('全都没数据 → at 为 null（头部显示"刷新"而不是"更新于"）', () => {
    expect(aggregateSummaries([{ refreshing: false, at: null }]).at).toBeNull();
  });
});

describe('selectPanelUnits', () => {
  const kill = (status: CapabilityMap[string]['status']): CapabilityMap => map(capability(status));

  it('★ 已启用但**没装好** → 也不列（口径：没装 = 不能用，配置里也不该出现）', () => {
    expect(selectPanelUnits([{ id: 'issues', shown: true }], kill('missing-plugin'))).toEqual([]);
    expect(selectPanelUnits([{ id: 'issues', shown: true }], kill('missing-commands'))).toEqual([]);
  });

  it('没启用且**明确未装** → 不列（卸载后模块就该消失，而不是留一行点不动的）', () => {
    expect(selectPanelUnits([{ id: 'issues', shown: false }], kill('missing-plugin'))).toEqual([]);
  });

  it('没启用但装好了 → 列（用户可以把它打开）', () => {
    const rows = selectPanelUnits([{ id: 'issues', shown: false }], kill('ok'));

    expect(rows.map((row) => row.id)).toEqual(['issues']);
  });

  it('卸载过（released）→ 不列（与"机器上没有"同一处境）', () => {
    expect(selectPanelUnits([{ id: 'issues', shown: true }], kill('unchecked'))).toHaveLength(1);
    expect(
      selectPanelUnits([{ id: 'issues', shown: true }], { issues: capability('ok', { released: true }) }),
    ).toEqual([]);
  });

  it('探测**没有结论**时不隐藏（还没读到 / 探不动都不是"未装"）', () => {
    const units = [{ id: 'issues', shown: false }];

    expect(selectPanelUnits(units, null)).toHaveLength(1);
    expect(selectPanelUnits(units, {})).toHaveLength(1);
    expect(selectPanelUnits(units, kill('unchecked'))).toHaveLength(1);
  });

  it('保持入参顺序与类型（调用方还要用 titleKey）', () => {
    const rows = selectPanelUnits(
      [
        { id: 'ci', shown: true, titleKey: 'ci.title' },
        { id: 'issues', shown: true, titleKey: 'issues.title' },
      ],
      null,
    );

    expect(rows.map((row) => row.titleKey)).toEqual(['ci.title', 'issues.title']);
  });
});
