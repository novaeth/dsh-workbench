import { describe, expect, it, vi } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { dictionaries } from '@dsh-workbench/shared';
import { createClientUnitRegistry } from '@/kernel/client/registry';
import {
  MARKET_DOT,
  MARKET_STATE_KEY,
  installedRows,
  marketActions,
  marketHasUpdates,
  refusalReasons,
  withClientRefusals,
} from '../market-rows';

function unit(id: string): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
  };
}

describe('市场页的「已装（本机）」那半（module-distribution spec §4）', () => {
  it('★ 没有环境依赖的模块也必须有一行 —— 否则装上之后就再没有地方卸掉它', () => {
    const rows = installedRows(
      [{ unit: 'hello', pkg: '@dsh-workbench/module-hello', installed: '0.1.2' }],
      [unit('hello')],
      new Set(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'hello',
      titleKey: 'hello.mine',
      state: 'installed',
      pkg: '@dsh-workbench/module-hello',
      canUninstall: true,
    });
    expect(rows[0]?.hint).toBeUndefined();
    expect(marketActions(rows[0]!)).toEqual(['remove-bundle']);
  });

  it('★ 装上了却被拒的，要在这一行上说出来（不然"用不了"只在日志里）', () => {
    const rows = installedRows(
      [
        {
          unit: 'broken',
          pkg: '@dsh-workbench/module-broken',
          installed: '0.1.0',
          refused: ['dsh.workbench 没有 apiVersion', 'unit 形状不对'],
        },
      ],
      [],
      new Set(),
    );
    expect(rows[0]?.note).toEqual({
      key: 'panels.market.moduleRefused',
      params: {},
    });
    expect(rows[0]?.hint).toBeUndefined();
    expect(marketActions(rows[0]!)).toEqual(['remove-bundle']);
  });

  it('没被拒的行不带那句话（别给每一行都挂一句）', () => {
    const rows = installedRows([{ unit: 'hello', pkg: '@p/hello', installed: '0.1.0' }], [unit('hello')], new Set());
    expect(rows[0]?.note).toBeUndefined();
  });

  it('★ 没配来源时行上要说「没检查新版」，别让人以为已经是最新', () => {
    const rows = installedRows(
      [{ unit: 'hello', pkg: '@p/hello', installed: '0.1.0', latestUnavailable: 'no-registry' }],
      [unit('hello')],
      new Set(),
    );
    expect(rows[0]?.note).toEqual({ key: 'panels.market.latestNoRegistry', params: {} });
    expect(rows[0]?.canUpdate).toBe(false);
    expect(marketActions(rows[0]!)).toEqual(['remove-bundle']);
  });

  it('★ 问了但没问成 → 另一句话（和"没配来源"分开说）', () => {
    const rows = installedRows(
      [{ unit: 'hello', pkg: '@p/hello', installed: '0.1.0', latestUnavailable: 'probe-failed' }],
      [unit('hello')],
      new Set(),
    );
    expect(rows[0]?.note).toEqual({ key: 'panels.market.latestProbeFailed', params: {} });
  });

  it('从 Git 装的本来就没有 registry 版本可比 → 不挂这句（它不是"查不到"）', () => {
    const rows = installedRows(
      [{ unit: 'hello', pkg: '@p/hello', installed: '0.1.0', latestUnavailable: 'not-registry' }],
      [unit('hello')],
      new Set(),
    );
    expect(rows[0]?.note).toBeUndefined();
  });

  it('本地 link 的不挂这句（行上的「本地」标签已经说明）', () => {
    const rows = installedRows(
      [{ unit: 'hello', pkg: '@p/hello', installed: '0.1.0', local: true, latestUnavailable: 'local' }],
      [unit('hello')],
      new Set(),
    );
    expect(rows[0]?.note).toBeUndefined();
  });

  it('★ 还没载入的，才是真的「还没生效」—— 只有这一类能给那句', () => {
    const rows = installedRows(
      [{ unit: 'fresh', pkg: '@dsh-workbench/module-fresh', installed: '0.1.0' }],
      [],
      new Set(),
    );
    expect(rows[0]?.hint).toBe('panels.market.moduleRestartHint');
  });

  it('★ 装了但还没生效那一行：文案是「未生效」、点是黄的（不是「已安装」+绿点）', () => {
    const rows = installedRows(
      [
        {
          unit: 'deploy',
          pkg: '@acme-dsh-workbench/module-deploy',
          installed: '0.2.0',
        },
      ],
      [],
      new Set(),
    );

    expect(rows[0]?.state).toBe('inactive');
    expect(MARKET_DOT.inactive).toBe('warning');
    expect(MARKET_STATE_KEY.inactive).toBe('panels.market.notActive');
    expect(dictionaries.zh['panels.market.notActive']).toBe('未生效');
    expect(dictionaries.zh['panels.market.moduleRestartHint']).not.toContain('还没生效');
  });

  it('★ 装了但工作台不认它：也不是「已安装」，是「不可用」（点也是红的）', () => {
    const rows = installedRows(
      [
        {
          unit: 'old',
          pkg: '@p/old',
          installed: '0.1.0',
          refused: ['dsh.workbench 缺 apiVersion'],
        },
      ],
      [],
      new Set(),
    );

    expect(rows[0]?.state).toBe('unusable');
    expect(MARKET_DOT.unusable).toBe('error');
    expect(MARKET_STATE_KEY.unusable).toBe('panels.market.notUsable');
    expect(dictionaries.zh['panels.market.notUsable']).toBe('不可用');
    expect(rows[0]?.note?.key).toBe('panels.market.moduleRefused');
  });

  it('★ 有几版新可装时这一行照旧说「有新版」，不摆红点（两条都是真的，红点留给"完全用不上"）', () => {
    const rows = installedRows(
      [{ unit: 'fresh', pkg: '@dsh-workbench/module-fresh', installed: '0.1.0', latest: '0.1.1' }],
      [],
      new Set(),
    );

    expect(rows[0]?.state).toBe('outdated');
    expect(rows[0]?.hint).toBe('panels.market.moduleRestartHint');
  });

  it('★ 本地装的（link:）只标来源，不给任何解释 —— 更不许说「还没生效」', () => {
    const rows = installedRows(
      [
        {
          unit: 'wallet',
          pkg: '@dsh-workbench/module-wallet',
          installed: '0.1.0',
          local: true,
        },
      ],
      [unit('wallet')],
      new Set(),
    );
    expect(rows[0]).toMatchObject({ id: 'wallet', local: true });
    expect(rows[0]?.hint).toBeUndefined();
  });

  it('★ 有新版才给更新，且走 bundle 的那条路（update-bundle）', () => {
    const rows = installedRows(
      [{ unit: 'inventory', pkg: '@acme/module-inventory', installed: '0.1.1', latest: '0.1.2' }],
      [unit('inventory')],
      new Set(),
    );
    expect(rows[0]).toMatchObject({
      state: 'outdated',
      moduleUpdate: { installed: '0.1.1', latest: '0.1.2' },
      canUpdate: true,
    });
    expect(marketActions(rows[0]!)).toEqual(['update-bundle', 'remove-bundle']);
  });

  it('★ 源上的新版要更新的工作台 → 仍然说「有新版」，但不给更新按钮，并说清为什么', () => {
    const rows = installedRows(
      [
        {
          unit: 'inventory',
          pkg: '@acme/module-inventory',
          installed: '0.1.1',
          latest: '0.2.0',
          latestBlocked: 'needs-workbench',
        },
      ],
      [unit('inventory')],
      new Set(),
    );
    expect(rows[0]).toMatchObject({
      state: 'outdated',
      moduleUpdate: { installed: '0.1.1', latest: '0.2.0', blocked: 'needs-workbench' },
      canUpdate: false,
      hint: 'panels.market.updateNeedsWorkbench',
    });
    expect(marketActions(rows[0]!)).toEqual(['remove-bundle']);
    expect(marketHasUpdates(rows)).toBe(false);
  });

  it('★ 新版和这一版工作台不匹配（更旧或形状不对）→ 也不给更新，换一句说清', () => {
    const rows = installedRows(
      [
        {
          unit: 'inventory',
          pkg: '@acme/module-inventory',
          installed: '0.1.1',
          latest: '0.2.0',
          latestBlocked: 'incompatible',
        },
      ],
      [unit('inventory')],
      new Set(),
    );
    expect(rows[0]?.hint).toBe('panels.market.updateIncompatible');
    expect(marketActions(rows[0]!)).toEqual(['remove-bundle']);
  });

  it('供给那一段已经列过的单元不重复出现（那行本来就有装/卸/更新）', () => {
    const rows = installedRows(
      [{ unit: 'issues', pkg: '@acme/module-issues', installed: '1.0.0' }],
      [unit('issues')],
      new Set(['issues']),
    );
    expect(rows).toEqual([]);
  });

  it('单元没注册、也没记住名字 → 退成单元 id（短），不是那串 scoped 包名', () => {
    const rows = installedRows(
      [{ unit: 'ghost', pkg: '@acme/module-ghost', installed: '0.3.0' }],
      [],
      new Set(),
    );
    expect(rows[0]?.titleKey).toBe('ghost');
    expect(rows[0]?.pkg).toBe('@acme/module-ghost');
  });

  it('★ 宿主没担保它的清单（被拒 / 待重启）→ 用包里那一刻的名字，不是单元 id', () => {
    const rows = installedRows(
      [{ unit: 'inventory', pkg: '@acme/module-inventory', installed: '0.1.7' }],
      [],
      new Set(),
      new Map([['inventory', '构建发布']]),
    );
    expect(rows[0]?.label).toBe('构建发布');
    expect(rows[0]?.titleKey).toBe('inventory');
  });
});

describe('浏览器那半的拒因也进同一行（C-9）', () => {
  it('★ 浏览器那半说「宿主还没担保它的清单」= 刚装完没重启那一类 → 走「重启就会出来」，不摆「更新 / 卸载」', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const units = createClientUnitRegistry();
    units.register({ unit: 'ghost', card: () => null });

    const rows = installedRows(
      withClientRefusals(
        [{ unit: 'ghost', pkg: '@dsh-workbench/module-ghost', installed: '0.1.0' }],
        units.refusals(),
      ),
      [],
      new Set(),
    );

    expect(units.refusals().map((one) => one.kind)).toEqual(['no-manifest']);
    expect(rows[0]?.note).toBeUndefined();
    expect(rows[0]?.hint).toBe('panels.market.moduleRestartHint');
    warn.mockRestore();
  });

  it('★ 宿主不认它 → 行上只给那句通用说明，不把内部拒因摆给用户，也不再叫他重启', () => {
    const rows = installedRows(
      [
        {
          unit: 'old',
          pkg: '@dsh-workbench/module-old',
          installed: '0.1.0',
          refused: ['dsh.workbench 缺 apiVersion'],
        },
      ],
      [],
      new Set(),
    );

    expect(rows[0]?.note).toEqual({ key: 'panels.market.moduleRefused', params: {} });
    expect(rows[0]?.hint).toBeUndefined();
  });

  it('★ 两侧都拒也只挂一条说明（不按拒因条数重复）', () => {
    const rows = installedRows(
      [
        {
          unit: 'old',
          pkg: '@dsh-workbench/module-old',
          installed: '0.1.0',
          refused: ['dsh.workbench 缺 apiVersion'],
          clientRefused: ['宿主没有担保 unit「old」的清单 —— 卡片先不挂'],
        },
      ],
      [],
      new Set(),
    );

    expect(rows[0]?.state).toBe('unusable');
    expect(rows[0]?.note?.key).toBe('panels.market.moduleRefused');
  });

  it('两侧都没报就一个字都不给；只有客户端报了，它自己重复的也只留一条', () => {
    expect(refusalReasons(undefined, undefined)).toEqual([]);
    expect(refusalReasons([], ['卡片没挂上', '卡片没挂上', '清单里没有它'])).toEqual([
      '卡片没挂上',
      '清单里没有它',
    ]);
  });

  it('★ 行上那句人话里不许出现内部词（受众是装了模块的人）', () => {
    const internal = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    for (const language of ['zh', 'en'] as const) {
      for (const key of [
        'panels.market.moduleRefused',
        'panels.market.updateNeedsWorkbench',
        'panels.market.updateIncompatible',
      ] as const) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        for (const word of internal) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
    }
  });
});
