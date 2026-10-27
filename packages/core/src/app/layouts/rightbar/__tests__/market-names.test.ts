import { describe, expect, it } from 'vitest';
import type { Translate, UnitTitle } from '@dsh-workbench/shared';
import { unitTitleKey } from '@dsh-workbench/shared';
import { namesOf, type NameSource } from '../market-names';
import {
  installedRows,
  marketOrder,
  marketRowTitle,
  marketRows,
  type MarketRow,
} from '../market-rows';

const title = (zh: string, en: string): UnitTitle => ({ zh, en });

const t: Translate = (key) => {
  const words: Readonly<Record<string, string>> = {
    'a.mine': '发布看板',
    'b.mine': '库存',
    'x.mine': '看板',
    [unitTitleKey('a')]: '发布会',
  };
  return words[key] ?? key;
};

const titleOf = (value: UnitTitle | undefined): string => value?.zh ?? '';

function moduleOf(unit: string, value?: UnitTitle): NameSource {
  return { unit, ...(value === undefined ? {} : { title: value }) };
}

function order(rows: readonly MarketRow[], translate: Translate = t): string[] {
  return marketOrder(rows, (row) => marketRowTitle(row, translate)).map((row) => row.id);
}

describe('namesOf：名字从哪来', () => {
  it('★ 外壳已经把名字注册进词表（清单里那份）→ 用活的，切语言跟着变', () => {
    const english: Translate = (key) => (key === unitTitleKey('a') ? 'Launches' : key);
    expect(namesOf(t, [moduleOf('a')], titleOf).get('a')).toBe('发布会');
    expect(namesOf(english, [moduleOf('a')], titleOf).get('a')).toBe('Launches');
  });

  it('★ 词表里还没有（没载入 / 刚装完没重启）→ 用包里那份字面量', () => {
    expect(namesOf(t, [moduleOf('b', title('库存', 'Inventory'))], titleOf).get('b')).toBe('库存');
  });

  it('★ 宿主被拒、清单里没它：包里那份字面量照样翻得出（截图那一行）', () => {
    const names = namesOf(t, [moduleOf('argocd', title('ArgoCD 面板', 'ArgoCD'))], titleOf);
    expect(names.get('argocd')).toBe('ArgoCD 面板');
  });

  it('两边都没有 → 不给名字（行上退到单元 id，不摆包名）', () => {
    expect(namesOf(t, [moduleOf('ghost')], titleOf).size).toBe(0);
    expect(namesOf(t, [moduleOf('ghost', title('', ''))], titleOf).size).toBe(0);
  });
});

describe('★ 名字链：清单 → 包里的字面量 → 单元 id', () => {
  it('宿主担保了清单 → 用清单那张卡的键', () => {
    const manifest = {
      id: 'a',
      title: title('发布会', 'Launches'),
      titleKey: unitTitleKey('a'), card: { order: 10 },
      tools: [],
      host: { inject: [] },
    };
    const row = installedRows([{ unit: 'a', pkg: '@p/a', installed: '1.0.0' }], [manifest], new Set())[0];
    expect(row?.titleKey).toBe(unitTitleKey('a'));
    expect(row?.label).toBeUndefined();
  });

  it('★ 宿主没担保清单、包里有名字 → 显示名字，不是包名', () => {
    const names = namesOf(t, [moduleOf('a', title('发布会', 'Launches'))], titleOf);
    const row = installedRows(
      [{ unit: 'a', pkg: '@p/a', installed: '1.0.0', title: title('发布会', 'Launches') }],
      [],
      new Set(),
      names,
    )[0];
    expect(row?.label).toBe('发布会');
    expect(row?.titleKey).toBe('a');
  });

  it('★ 连名字都没有 → 单元 id（不摆 scoped 包名）', () => {
    const row = installedRows([{ unit: 'a', pkg: '@p/a', installed: '1.0.0' }], [], new Set())[0];
    expect(row?.titleKey).toBe('a');
    expect(row?.pkg).toBe('@p/a');
  });
});

describe('★ 更新前和更新完：同一行在同一个位置', () => {
  const loaded = [
    { id: 'a', title: title('发布会', 'Launches'), titleKey: unitTitleKey('a'), card: { order: 10 }, tools: [], host: { inject: [] } },
    { id: 'b', title: title('库存', 'Inventory'), titleKey: unitTitleKey('b'), card: { order: 20 }, tools: [], host: { inject: [] } },
    { id: 'x', title: title('看板', 'Board'), titleKey: unitTitleKey('x'), card: { order: 30 }, tools: [], host: { inject: [] } },
  ];
  const withoutX = loaded.slice(0, 2);
  const words: Readonly<Record<string, string>> = {
    [unitTitleKey('a')]: '发布会',
    [unitTitleKey('b')]: '库存',
    [unitTitleKey('x')]: '看板',
  };
  const live: Translate = (key) => words[key] ?? key;

  it('包里有名字 → 更新完（还没重启）也还是原来那个位置', () => {
    const names = namesOf(
      live,
      loaded.map((manifest) => moduleOf(manifest.id, manifest.title)),
      titleOf,
    );
    const before = order(
      [...marketRows(loaded as never, null), ...installedRows([], loaded as never, new Set())],
      live,
    );
    const after = order(
      [
        ...marketRows(withoutX as never, null),
        ...installedRows(
          [
            {
              unit: 'x',
              pkg: '@acme/module-x',
              installed: '2.0.0',
              title: title('看板', 'Board'),
            },
          ],
          withoutX as never,
          new Set(),
          names,
        ),
      ],
      live,
    );
    expect(before).toEqual(['a', 'x', 'b']);
    expect(after).toEqual(before);
  });

  it('名字也没了（包里的字面量读不到）→ 退成单元 id，位置就跑了', () => {
    const after = order(
      [
        ...marketRows(withoutX as never, null),
        ...installedRows([{ unit: 'x', pkg: '@acme/module-x', installed: '2.0.0' }], withoutX as never, new Set()),
      ],
      live,
    );
    expect(after).toEqual(['a', 'b', 'x']);
  });
});
