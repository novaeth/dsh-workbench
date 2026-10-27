import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries, type Translate } from '@dsh-workbench/shared';
import { installedPluginRows } from '../market-plugin-rows';
import {
  MARKET_DOT,
  marketActions,
  marketRowTitle,
  MARKET_STATE_KEY,
  marketSwitchLocked,
} from '../market-rows';

const KEY_PASS: Translate = (key) => key;

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('「已安装 opencli 插件」的行：干净（名字 + 版本 + 更新 + 卸载）', () => {
  it('★ 台账里有这一笔就有一行：插件名当显示名，版本带箭头，两个动作都在', () => {
    const row = installedPluginRows([
      { pkg: 'opencli-plugin-inventory', name: 'inventory', installed: '1.0.24', latest: '1.0.25' },
    ])[0];

    expect(row?.label).toBe('inventory');
    expect(row?.pkg).toBe('opencli-plugin-inventory');
    expect(row?.plugin).toBe(true);
    expect(row?.state).toBe('outdated');
    expect(row?.version).toEqual({ installed: '1.0.24', latest: '1.0.25' });
    expect(marketActions(row as never)).toEqual(['update-plugin', 'uninstall-plugin']);
    expect(marketRowTitle(row as never, KEY_PASS)).toBe('inventory');
  });

  it('★ 行上没有「谁在用」、也没有重启提示（关系只在「共用依赖」那一处）', () => {
    const rows = installedPluginRows([
      { pkg: 'opencli-plugin-inventory', name: 'inventory', installed: '1.0.24', latest: '1.0.25' },
      { pkg: 'opencli-plugin-local', name: 'local', local: true },
    ]);

    for (const row of rows) {
      expect(row.hint).toBeUndefined();
      const text = JSON.stringify(row);
      expect(text).not.toContain('sharedUsedBy');
      expect(text).not.toContain('usedBy');
      expect(text).not.toContain('moduleRestartHint');
      expect(text).not.toContain('restart');
    }
  });

  it('★ 没有源的那一笔（本地 / git 装的）不给「更新」—— 也不解释"为什么不给"', () => {
    const row = installedPluginRows([{ pkg: '/Users/me/my-plugin', name: 'mine', local: true }])[0];

    expect(marketActions(row as never)).toEqual(['uninstall-plugin']);
    expect(row?.local).toBe(true);
    expect(row?.note).toBeUndefined();
    expect(row?.version).toBeUndefined();
  });

it('★ 插件名 ≠ 包名 → 标题给插件名、版本号那格给「包名@版本」，不再单独一句说明', () => {
    const rows = installedPluginRows([
      { pkg: 'opencli-plugin-dashboards', name: 'dashboards', installed: '1.0.16' } as never,
    ]);

    expect(rows[0]?.versionLabel).toBe('opencli-plugin-dashboards@1.0.16');
    expect(rows[0]?.note).toBeUndefined();
  });

  it('名字就是包名 → 不多说一句（不摆一句没信息的话）', () => {
    const row = installedPluginRows([{ pkg: 'opencli-plugin-inventory', name: 'opencli-plugin-inventory' }])[0];

    expect(row?.note).toBeUndefined();
  });

  it('本地装的那一份：包名是个目录，不给「包名是 …」那句，也不挂任何 note', () => {
    const row = installedPluginRows([
      { pkg: '/Users/me/my-plugin', name: 'mine', local: true },
    ])[0];

    expect(row?.note).toBeUndefined();
  });

  it('★ 装坏了（目录在但看不出是个插件）→ 行上直说，并给卸载与指路', () => {
    const row = installedPluginRows([{ pkg: 'opencli-plugin-inventory', name: 'inventory', broken: true }])[0];

    expect(row?.plugin).toBe(true);
    expect(row?.broken).toBe(true);
    expect(row?.state).toBe('broken');
    expect(MARKET_STATE_KEY.broken).toBe('panels.market.broken');
    expect(MARKET_DOT.broken).toBe('error');
    expect(dictionaries.zh['panels.market.broken']).toBe('装坏了');
    expect(row?.note?.key).toBe('panels.market.pluginBroken');
    expect(marketActions(row as never)).toEqual(['uninstall-plugin']);
  });

  it('★ 装坏了压过另外两句（一句话只说最要紧的那件）', () => {
    const row = installedPluginRows([
      { pkg: '/Users/me/my-plugin', name: 'mine', local: true, broken: true },
    ])[0];

    expect(row?.note?.key).toBe('panels.market.pluginBroken');
  });

  it('装的是有源的包、但没读到本地版本（npm ls 没找到）→ 不摆一个结果未知的「更新」', () => {
    const row = installedPluginRows([{ pkg: 'opencli-plugin-inventory', name: 'inventory', latest: '1.0.25' }])[0];

    expect(row?.state).toBe('installed');
    expect(marketActions(row as never)).toEqual(['uninstall-plugin']);
    expect(row?.version).toBeUndefined();
  });

  it('没有插件名时退回包名当显示名（台账没补上映射也不至于空白）', () => {
    const row = installedPluginRows([{ pkg: 'opencli-plugin-inventory', installed: '1.0.24' }])[0];

    expect(marketRowTitle(row as never, KEY_PASS)).toBe('opencli-plugin-inventory');
    expect(row?.state).toBe('installed');
    expect(MARKET_STATE_KEY[row?.state ?? 'unknown']).toBe('panels.market.installed');
  });
});

describe('插件行上那颗「默认启用」：与模块行同一笔账', () => {
  const Inventory = { pkg: 'opencli-plugin-inventory', name: 'inventory', installed: '1.0.24' } as const;
  const ID = 'plugin:opencli-plugin-inventory';

  it('★ 行 id 就是插件 id（plugin: 前缀），开关状态就是机器级默认板', () => {
    const row = installedPluginRows([Inventory], new Set([ID]), { [ID]: 2 })[0];

    expect(row?.id).toBe(ID);
    expect(row?.defaultShown).toBe(true);
    expect(row?.defaultChanged).toBe(2);
  });

  it('★ 机器板上没开它 ⇒ 是"关着"，不是"没有这颗钮"', () => {
    const row = installedPluginRows([Inventory], new Set(), {})[0];

    expect(row?.defaultShown).toBe(false);
    expect(row?.defaultChanged).toBe(0);
  });

  it('★ 装坏了那一行照画这颗钮，但**禁用它**（行上已经写着为什么；钮不给动）', () => {
    const row = installedPluginRows([{ ...Inventory, broken: true }], new Set([ID]), { [ID]: 1 })[0];

    expect(row?.broken).toBe(true);
    expect(row?.defaultShown).toBe(true);
    expect(row?.defaultChanged).toBe(1);
    expect(marketSwitchLocked(row as never)).toBe(true);
  });

  it('★ 好好的插件行那颗钮是能动的（禁用只留给"这份用不了"）', () => {
    const row = installedPluginRows([Inventory], new Set([ID]), {})[0];

    expect(marketSwitchLocked(row as never)).toBe(false);
  });

  it('★ 悬停沿用模块行那一句（插件行自己不新造第二条文案；那串"几个工作区改过"已去掉）', () => {
    const source = read('market-plugin-rows.ts');
    const section = read('market-section.tsx');

    expect(source).not.toContain('defaultLabel');
    expect(source).not.toContain('changedBy');
    expect(section).toContain("t('panels.market.defaultLabel')");
    expect(section).not.toContain('changedBy');
  });

it('★ 现在只有「装坏了」那一句是告警；名字映射不再有说明', () => {
    const rows = installedPluginRows([
      { pkg: 'opencli-plugin-dashboards', name: 'dashboards', installed: '1.0.16' } as never,
      { pkg: 'opencli-plugin-broken', name: 'broken', broken: true } as never,
    ]);

    expect(rows[0]?.note).toBeUndefined();
    expect(rows[1]?.note?.tone).toBe('alert');
  });

});

describe('坏了的插件那行：原因给用户看，不给人话以外的底层词', () => {
  it('★ 句子是人话：外壳 / 协议 / 声明 / 清单 / apiVersion 一个都不许出现', () => {
    const internal = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    const keys = ['panels.market.pluginBroken'] as const;
    for (const language of ['zh', 'en'] as const) {
      for (const key of keys) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        for (const word of internal) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
    }
  });
});
