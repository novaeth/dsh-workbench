import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MarketRow } from '../market-row-types';
import { MODULE_SETTLE_MS } from '../market-settle';
import {
  holdExpired,
  holdOf,
  pendingLanded,
  pendingRowOf,
  marketFootVisible,
  pinnedRowOf,
  withPinnedRow,
  type HeldRow,
  type Pending,
} from '../market-view-text';

const row = (over: Partial<MarketRow> = {}): MarketRow => ({
  id: 'delivery',
  titleKey: 'delivery.cardTitle',
  state: 'outdated',
  canInstall: false,
  canUpdate: true,
  canUninstall: true,
  pkg: '@p/module-delivery',
  ...over,
});

const pending = (over: Partial<Pending> = {}): Pending => ({ id: 'delivery', action: 'update', ...over });

const clicked = row();
const flippedMidRun = row({ pkg: undefined, canUpdate: false, state: 'inactive' });

describe('点下去那一行：从点下去到真的安定，只有右边在变', () => {
  it('★ 跑到一半名单里没有它了（客户端半侧被摘掉）→ 照原样补回来', () => {
    const shown = withPinnedRow([row({ id: 'inventory' })], pinnedRowOf(pending({ row: clicked }), undefined));

    expect(shown.map((item) => item.id)).toEqual(['inventory', 'delivery']);
    expect(shown[1]).toBe(clicked);
  });

  it('★ 名单里还有它、但是另一份名单重算出来的 → 用点下去时那一份顶掉（pkg / canUpdate 不被换走）', () => {
    const shown = withPinnedRow([flippedMidRun], pinnedRowOf(pending({ row: clicked }), undefined));

    expect(shown[0]).toBe(clicked);
    expect(shown[0]?.pkg).toBe('@p/module-delivery');
    expect(shown[0]?.canUpdate).toBe(true);
  });

  it('★ 装完那一瞬间（名册还没回来）还是那一份；名册回来才交给真实行', () => {
    const held: HeldRow = { id: 'delivery', row: clicked };

    expect(pinnedRowOf(null, held)).toBe(clicked);
    expect(holdExpired(held, true, 10)).toBe(true);
    expect(holdExpired(held, false, MODULE_SETTLE_MS - 1)).toBe(false);
    expect(holdExpired(held, false, MODULE_SETTLE_MS)).toBe(true);
    expect(holdExpired(undefined, false, 0)).toBe(true);
  });

  it('★ 宿主说真换上了（applied）才留那一份；★ 说要重启（restart-required）当场不留', () => {
    expect(holdOf(pending({ row: clicked }), 'applied')).toEqual({ id: 'delivery', row: clicked });
    expect(holdOf(pending({ row: clicked }), 'restart-required')).toBeUndefined();
    expect(holdOf(pending({ row: clicked }), 'overridden')).toBeUndefined();
    expect(holdOf(pending({ row: clicked }), 'failed')).toBeUndefined();
    expect(holdOf(pending({ row: clicked }), undefined)).toBeUndefined();
    expect(holdOf(pending(), 'applied')).toBeUndefined();
    expect(holdOf(null, 'applied')).toBeUndefined();
  });

  it('不是那一行在跑 → 原样（重算出来的态照显示）', () => {
    const live = row({ id: 'inventory', state: 'inactive', hint: 'panels.market.moduleRestartHint' });
    const shown = withPinnedRow([live], pinnedRowOf(pending({ row: clicked }), undefined));

    expect(shown[0]).toBe(live);
    expect(shown[0]?.state).toBe('inactive');
    expect(shown[0]?.hint).toBe('panels.market.moduleRestartHint');
  });

  it('没记那一份（插件 / 工作台那几跳不记）→ 名单原样，只是换了份新数组', () => {
    const list = [row({ id: 'inventory' }), row({ id: 'issues' })];
    const shown = withPinnedRow(list, pinnedRowOf(pending({ row: undefined }), undefined));

    expect(shown).toEqual(list);
    expect(shown).not.toBe(list);
  });
});

describe('市场里那句"装好后到那个项目的面板页勾选它"', () => {
  it('★ 一个模块都没有（只有工作台自己那一行）→ 不摆这句话', () => {
    expect(marketFootVisible([], [])).toBe(false);
  });

  it('★ 有模块（装了或可装）→ 摆出来', () => {
    expect(marketFootVisible([row()], [])).toBe(true);
    expect(marketFootVisible([], [row({ id: 'inventory' })])).toBe(true);
  });
});

describe('卸载那一段的行：名字也用点下去时那一份', () => {
  it('★ 快照里有名字就照它渲染（模块的字典这会儿已经被撤走了）', () => {
    const pending: Pending = {
      id: 'delivery',
      action: 'remove-bundle',
      titleKey: 'delivery.cardTitle',
      label: 'Delivery',
      pkg: '@p/delivery',
      version: '0.9.0',
    };

    const row = pendingRowOf({ pending, removing: 'delivery', rows: [], titles: new Map() });
    expect(row?.label).toBe('Delivery');
    expect(row?.titleKey).toBe('delivery.cardTitle');
  });

  it('没名字（老写法 / 插件那几跳）→ 照旧按 key 翻', () => {
    const pending: Pending = { id: 'delivery', action: 'remove-bundle', titleKey: 'delivery.cardTitle' };

    expect(pendingRowOf({ pending, removing: 'delivery', rows: [], titles: new Map() })?.label).toBeUndefined();
  });
});

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('更新跑完那一格：解锁挂在读数上，不是挂到写响应上', () => {
  it('★ 面板把"读数追上了"算出来交给等待那一格，那一格才去清 pending', () => {
    const view = read('MarketView.tsx');
    const text = read('market-view-text.ts');
    const hold = read('market-settle-hold.ts');

    expect(view).toContain('pendingLanded(');
    expect(view).toContain('workbench?.installed,');
    expect(view).toMatch(/useSettleHold\(\{/);
    expect(view).toContain('selfUpdate:');
    expect(text).toContain('settleLanded({');
    expect(hold).toMatch(/if \(!watching \|\| !landed\) return;\s*setPending\(null\);/);
    expect(hold).toContain('holdWindowMs(until)');
    expect(hold).toContain('panels.market.swapSlow');
  });

  it('★ 等读数这一格认的是 pending 自己那两枚记号（不给别的动作长挂）', () => {
    const hold = read('market-settle-hold.ts');

    expect(hold).toContain('pending.until !== undefined || pending.readBack === true');
  });

  it('★ 那一笔的"追上了没有"：读数还没动就挂着，读数动了/追平就放行', () => {
    const updates = { delivery: { installed: '0.9.0', latest: '0.10.0' } };
    const fresh = { delivery: { installed: '0.10.0', latest: '0.10.0' } };
    const pending = { id: 'delivery', action: 'update-bundle' as const, version: '0.9.0', readBack: true };

    expect(pendingLanded(null, updates, null, undefined)).toBe(true);
    expect(pendingLanded(pending, updates, null, undefined)).toBe(false);
    expect(pendingLanded(pending, fresh, null, undefined)).toBe(true);
  });

  it('★ 能力那一跳（update）看的是"那几条命令还缺不缺"，不看版本那一格', () => {
    const pending = { id: 'delivery', action: 'update' as const, version: '0.9.0', readBack: true };
    const capabilities = {
      delivery: { unit: 'delivery', status: 'missing-commands' as const, required: ['x'], missing: ['x'], detail: '' },
    };
    const ok = {
      delivery: { unit: 'delivery', status: 'ok' as const, required: [], missing: [], detail: '' },
    };

    expect(pendingLanded(pending, {}, capabilities, undefined)).toBe(false);
    expect(pendingLanded(pending, {}, ok, undefined)).toBe(true);
  });

  it('★ 工作台那一跳不吃读数那一格，照旧比"盘上真到那一版"', () => {
    const pending = { id: 'workbench', action: 'update-workbench' as const, until: '0.2.6' };

    expect(
      pendingLanded(pending, { workbench: { installed: '0.2.6', latest: '0.2.6' } }, null, '0.2.5'),
    ).toBe(false);
    expect(pendingLanded(pending, {}, null, '0.2.6')).toBe(true);
  });
});
