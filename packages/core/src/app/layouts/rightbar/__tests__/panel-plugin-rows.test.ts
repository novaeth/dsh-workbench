import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { selectPanelRows } from '../board-selection';
import type { PanelPluginUnit, PanelUnit } from '../use-panels';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const MODULE: PanelUnit = {
  id: 'issues',
  titleKey: 'issues.mine',
  shown: true,
  source: 'user',
  hasCard: true,
};

const PLUGIN: PanelPluginUnit = {
  id: 'plugin:opencli-plugin-inventory',
  pkg: 'opencli-plugin-inventory',
  title: 'inventory',
  shown: false,
  source: 'default',
};

const BROKEN: CapabilityMap = {
  issues: {
    unit: 'issues',
    status: 'missing',
    needs: [{ id: 'extension:demo', kind: 'extension', name: 'demo', status: 'missing', detail: '' }],
  },
};

describe('面板配置那一屏的行：模块 + 插件行', () => {
  it('★ 插件行不过能力那道过滤（模块因为"没装好"被筛掉时，插件行照旧在）', () => {
    const rows = selectPanelRows([MODULE], [PLUGIN], BROKEN);

    expect(rows.map((row) => row.id)).toEqual([PLUGIN.id]);
    expect(rows[0]).toEqual({
      id: PLUGIN.id,
      title: 'inventory',
      plugin: true,
      shown: false,
      source: 'default',
    });
  });

  it('没有能力表（还没探到）时插件行也在', () => {
    const rows = selectPanelRows([MODULE], [PLUGIN], null);

    expect(rows.map((row) => row.id)).toEqual([MODULE.id, PLUGIN.id]);
    expect(rows[0]?.plugin).toBe(false);
    expect(rows[0]?.titleKey).toBe('issues.mine');
  });

  it('★ 插件行用字面标题（i18n 词典里没有它的键），模块行还是走 titleKey', () => {
    const view = `${read('PanelGroupRows.tsx')}\n${read('ModulesPage.tsx')}`;

    expect(view).toContain('row.title ?? t(row.titleKey ?? row.id)');
    expect(view).toContain('titleKey="panels.groupPlugins"');
    expect(view).not.toContain('t(row.id)');
  });

  it('★ 插件行不参与拖动排序（它没有卡片，排的是卡片）；模块行照旧可拖', () => {
    const groups = read('PanelGroupRows.tsx');

    expect(groups).not.toContain('draggable');
    expect(groups).not.toContain("action: 'move'");
    expect(read('ModulesPage.tsx')).toContain("action: 'move'");
  });

  it('★ 三组：带卡片的（可拖）在前，无看板模块与 opencli 插件各成一组，各有自己的分组标题', () => {
    const page = read('ModulesPage.tsx');
    const groups = read('PanelGroupRows.tsx');

    expect(page).toContain('const carded: PanelRow[] = modules.filter((row) => row.hasCard !== false)');
    expect(page).toContain('const boardless: PanelRow[] = modules.filter((row) => row.hasCard === false)');
    expect(page).toContain('rows={boardless} titleKey="panels.groupBoardless"');
    expect(page).toContain('rows={pluginRows} titleKey="panels.groupPlugins"');
    expect(page.indexOf('rows={boardless}')).toBeLessThan(page.indexOf('rows={pluginRows}'));
    expect(groups).toContain('<h3 className={styles.groupTitle}>{t(titleKey)}</h3>');
  });

  it('★ 两语言文案齐、无内部词（两个分组标题）', () => {
    const internal = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    for (const language of ['zh', 'en'] as const) {
      for (const key of ['panels.groupBoardless', 'panels.groupPlugins'] as const) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        for (const word of internal) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
    }
    expect(dictionaries.zh['panels.groupBoardless']).toBe('无看板模块');
    expect(dictionaries.zh['panels.groupPlugins']).toBe('opencli 插件');
  });
});
