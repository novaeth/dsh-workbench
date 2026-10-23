import { describe, expect, it } from 'vitest';
import {
  heldEntriesOfHome,
  heldEntryOfPlugin,
  ledgerKeyOf,
  parsePluginLedger,
  pluginRetentionOf,
  withReleasedEntry,
  type PluginLedgerEntry,
} from '../plugin-ledger.js';

const HOME = '/h/workbench/opencli/home';

function entry(over: Partial<PluginLedgerEntry> = {}): PluginLedgerEntry {
  return {
    opencliHome: HOME,
    package: 'opencli-plugin-inventory',
    installedAt: '2026-10-14T00:00:00.000Z',
    ...over,
  };
}

describe('台账条目的「放手」那一笔', () => {
  it('老文件（没有 releasedAt）读出来还是"用户持着"（读旧数据，不是垫片）', () => {
    const parsed = parsePluginLedger({ entries: [entry()] });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.releasedAt).toBeUndefined();
    expect(heldEntriesOfHome(parsed, HOME)).toHaveLength(1);
  });

  it('★ 放手了的那一笔还在文件里（自动清得靠它认得"这是我们装的"），但不再是"持着"', () => {
    const released = withReleasedEntry([entry()], HOME, 'opencli-plugin-inventory', '2026-10-15T00:00:00.000Z');

    expect(released).toHaveLength(1);
    expect(released[0]?.releasedAt).toBe('2026-10-15T00:00:00.000Z');
    expect(heldEntriesOfHome(released, HOME)).toEqual([]);
  });

  it('记两次放手不覆盖第一次的时间（第二次是重放，不是新事实）', () => {
    const once = withReleasedEntry([entry()], HOME, 'opencli-plugin-inventory', '2026-10-15T00:00:00.000Z');
    const twice = withReleasedEntry(once, HOME, 'opencli-plugin-inventory', '2026-10-16T00:00:00.000Z');

    expect(twice[0]?.releasedAt).toBe('2026-10-15T00:00:00.000Z');
  });

  it('另一个 home 的那一笔不受影响（隔离 wrapper 会换 home）', () => {
    const other = entry({ opencliHome: '/h/global/opencli/home' });
    const released = withReleasedEntry([entry(), other], HOME, 'opencli-plugin-inventory', '2026-10-15T00:00:00.000Z');

    expect(released.find((item) => item.opencliHome !== HOME)?.releasedAt).toBeUndefined();
    expect(heldEntriesOfHome(released, other.opencliHome)).toHaveLength(1);
  });

  it('★ 按插件名找"用户持着的"那一份：插件名与包名两边都认（§3.4 那条映射）', () => {
    const entries = [entry({ name: 'inventory' })];

    expect(heldEntryOfPlugin(entries, HOME, 'inventory')?.package).toBe('opencli-plugin-inventory');
    expect(heldEntryOfPlugin(entries, HOME, 'opencli-plugin-inventory')?.name).toBe('inventory');
    expect(heldEntryOfPlugin(entries, HOME, '别的')).toBeUndefined();
    expect(heldEntryOfPlugin(entries, HOME, '  ')).toBeUndefined();
  });

  it('放手了的那一笔不再算"用户持着"（模块放手时就可以删它了）', () => {
    const released = withReleasedEntry([entry({ name: 'inventory' })], HOME, 'opencli-plugin-inventory', '2026-10-15T00:00:00.000Z');

    expect(heldEntryOfPlugin(released, HOME, 'inventory')).toBeUndefined();
  });

  it('键还是「home + 包名」（同一份文件里两个 home 不互相撒谎）', () => {
    expect(ledgerKeyOf({ opencliHome: '/a', package: 'x' })).not.toBe(
      ledgerKeyOf({ opencliHome: '/b', package: 'x' }),
    );
  });
});

describe('物理去留：由谁主张说话（动作与结果分层那条）', () => {
  it('用户还持着 → 留着（模块放手不动它）', () => {
    expect(pluginRetentionOf({ held: true, claimedBy: [], trustworthy: true })).toBe('keep-held');
    expect(pluginRetentionOf({ held: true, claimedBy: ['x'], trustworthy: false })).toBe('keep-held');
  });

  it('★ 不是用户持的、引用又不可信 → 一律不删（宁可留一个孤儿，也不删别人的文件）', () => {
    expect(pluginRetentionOf({ held: false, claimedBy: [], trustworthy: false })).toBe('keep-unsure');
    expect(pluginRetentionOf({ held: false, claimedBy: ['x'], trustworthy: false })).toBe('keep-unsure');
  });

  it('还有模块在用 → 留着（点了卸载，文件也不动）', () => {
    expect(pluginRetentionOf({ held: false, claimedBy: ['issues'], trustworthy: true })).toBe('keep-claimed');
  });

  it('★ 引用可信 + 没人主张 → 这才是唯一敢删的那一格', () => {
    expect(pluginRetentionOf({ held: false, claimedBy: [], trustworthy: true })).toBe('remove');
  });
});
