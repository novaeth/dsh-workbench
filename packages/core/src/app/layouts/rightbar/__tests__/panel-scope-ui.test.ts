import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@dsh-workbench/shared';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const PANEL_KEYS = [
  'panels.followAll',
  'panels.followAllConfirmTitle',
  'panels.followAllConfirmDetail',
  'panels.followAllConfirmAck',
  'panels.followAllConfirmYes',
  'panels.followAllConfirmNo',
  'panels.groupBoardless',
  'panels.groupPlugins',
] as const;

const MARKET_KEYS = [
  'panels.market.defaultHint',
  'panels.market.defaultLabel',
  'panels.market.defaultLocked',
] as const;

const INTERNAL = ['外壳', '协议', '声明', '清单', 'apiVersion'];

describe('两屏的分工：市场管机器级默认、面板管本工作区', () => {
  it('★「全部恢复默认」先问一遍（走 RiskConfirmation：勾了"我明白"才点得动），不直接落笔', () => {
    const view = read('ModulesPage.tsx');

    expect(view).toContain("onClick={() => setConfirmingReset(true)}");
    expect(view).toContain('<ResetConfirmation');
    expect(view).toMatch(/acknowledged=\{acknowledged\}/);
    expect(view).toMatch(/onAcknowledgedChange=\{setAcknowledged\}/);
    expect(view).toMatch(/onConfirm=\{\(\) => \{[\s\S]{0,80}?write\(\{ action: 'reset' \}\)/);
    expect(view).toMatch(/disabled=\{busy\}/);
  });

  it('★ 面板那屏：每行只剩一颗开关 —— 没有勾选框、开关自己不压暗、也不说"全局 / 这个项目"（用户不用感知这一层）', () => {
    const view = `${read('ModulesPage.tsx')}\n${read('PanelRowControls.tsx')}`;
    const controls = read('PanelRowControls.tsx');
    const css = readFileSync(new URL('../ModulesPage.module.css', import.meta.url), 'utf8');

    expect(controls).not.toContain('Checkbox');
    expect(controls).not.toContain('Tip');
    expect(controls).not.toContain('source');
    expect(css).not.toContain('switchFollowing');
    expect(view).toMatch(/disabled=\{busy\}/);
    expect(view).toContain("write({ action: 'reset' })");
    expect(view).toContain("t('panels.followAll')");
    expect(view).not.toContain('followOne');
    expect(view).not.toContain('panels.boardOwn');
  });

  it('★ 没设置过的那一行：点开关 = 按点的方向写一笔本工作区的覆盖（界面不再有"恢复跟随"这一笔）', () => {
    const controls = read('PanelRowControls.tsx');

    expect(controls).toMatch(/onWrite\(\{ action: next \? 'show' : 'hide', id: unit\.id \}\)/);
    expect(controls).not.toContain("action: 'follow'");
    expect(controls).not.toContain('title=');
  });

  it('★ 没启用的**整条**压暗（标签、标记、开关一起），悬停时恢复原亮度 —— 压暗的是亮度，不是能不能点', () => {
    const page = read('ModulesPage.tsx');
    const groups = read('PanelGroupRows.tsx');
    const css = readFileSync(new URL('../ModulesPage.module.css', import.meta.url), 'utf8');

    expect(page).toContain('if (!row.shown) parts.push(styles.rowOff)');
    expect(groups).toContain("row.shown ? '' : styles.rowOff");
    expect(css).toMatch(/\.rowOff \{\s*opacity: 0\.55;\s*\}/);
    expect(css).toMatch(/\.rowOff:hover \{\s*opacity: 1;\s*\}/);
  });

  it('★ 无看板那一组与插件那一组：同一份行组件、同一个标题样式（标题说了是哪一组，行上不再挂标签）', () => {
    const groups = read('PanelGroupRows.tsx');
    const css = readFileSync(new URL('../ModulesPage.module.css', import.meta.url), 'utf8');

    expect(groups).toContain('<h3 className={styles.groupTitle}>{t(titleKey)}</h3>');
    expect(groups).not.toContain('rowTag');
    expect(css).not.toContain('.rowTag');
    expect(css).toMatch(/\.groupTitle \{[^}]*color: var\(--dsw-alias-label-tertiary\)/);
    expect(read('ModulesPage.tsx')).not.toContain('tone="');
  });

  it('★ 那两条只服务"勾选框 / 压暗"的文案已经删了（两语言都不许留着）', () => {
    for (const language of ['zh', 'en'] as const) {
      for (const key of ['panels.followGlobal', 'panels.followGlobalHint', 'panels.followGlobalLocked', 'panels.ownValueHint'] as const) {
        expect(dictionaries[language][key as never]).toBeUndefined();
      }
    }
  });

  it('★ 市场那屏：默认那颗开关只在"带这个字段的行"上画，写入带 scope: machine', () => {
    const row = read('market-section.tsx');
    const view = read('MarketView.tsx');

    expect(row).toMatch(/row\.defaultShown === undefined \? null : \(/);
    expect(row).toContain("t('panels.market.defaultLabel')");
    expect(row).toContain('marketRowTitle(row, t)');
    expect(row).not.toContain('marketDefaultLabel');
    expect(row).toContain('marketSwitchSeat');
    expect(view).toContain("scope: 'machine'");
  });

  it('★ 那句说明搬进了钮的 Tip：页面上不再为它单占一行（谁也不悬停就少读一行字）', () => {
    const section = read('market-section.tsx');
    const view = read('MarketView.tsx');

    expect(section).toContain("'panels.market.defaultHint'");
    expect(section).toContain('marketSwitchLocked(row)');
    expect(view).not.toContain('defaultNote');
    expect(readFileSync(new URL('../../market/MarketPage.module.css', import.meta.url), 'utf8'))
      .not.toContain('marketDefaultNote');
  });

  it('★ 行尾那一列：动作钮在前、开关在最右，中间一条竖线、左右间距一样', () => {
    const row = read('market-section.tsx');
    const css = readFileSync(new URL('../../market/MarketPage.module.css', import.meta.url), 'utf8');
    const ruleOf = (name: string): string => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const gapOf = (body: string): string => /gap:\s*var\((--wb-len-\d+)\)/.exec(body)?.[1] ?? '';
    const divider = new RegExp('\\.marketSwitchSeat::before\\s*\\{([^}]*)\\}').exec(css)?.[1] ?? '';

    expect(row.indexOf('marketSwitchSeat')).toBeGreaterThan(row.indexOf('marketActions'));
    expect(gapOf(ruleOf('marketEnd'))).not.toBe('');
    expect(gapOf(ruleOf('marketSwitchSeat'))).toBe(gapOf(ruleOf('marketEnd')));
    expect(divider).toContain('border-left: 0.5px solid var(--dsw-alias-border-l3)');
  });

  it('★ 行尾那列：正经动作与危险动作都是**带字的钮**（卸载不摆光秃秃一个垃圾桶）', () => {
    const row = read('market-section.tsx');

    expect(row).toMatch(/danger \? 'wb-dangerAction' : update \? styles\.marketUpdateAction/);
    expect(row).toContain("'update-workbench',");
    expect(row).toMatch(/\{t\(ACTION_LABEL_KEY\[action\]\)\}/);
    expect(row).not.toContain('marketIconAction');
  });

  it('★ 插件行吃的是同一套：机器板与改动数喂给插件行，写入还是那一行的 id + scope: machine', () => {
    const view = read('MarketView.tsx');
    const section = read('market-section.tsx');

    expect(view).toMatch(/installedPluginRows\([^)]*byDefault[^)]*changed\)/);
    expect(view).toContain("{ action: next ? 'show' : 'hide', id, scope: 'machine' }");
    expect(section).toContain('onDefault?.(row.id, next)');
    expect(read('market-plugin-rows.ts')).toContain('defaultShown: defaults.has(id)');
  });

  it('★ 每一段都要把"默认启用"这两颗传下去（漏一段 = 那段的拨钮点了没反应）', () => {
    const view = readFileSync(new URL('../MarketView.tsx', import.meta.url), 'utf8');
    const blocks = view
      .split('<MarketSection')
      .slice(1)
      .map((part) => part.split('/>')[0] ?? '');

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block, block.slice(0, 40)).toContain('onDefault={setDefault}');
      expect(block, block.slice(0, 40)).toContain('boardBusy={boardBusy}');
    }
  });

  it('★ 两语言文案齐、无内部词："默认"二字必须在市场那颗开关的文案里', () => {
    for (const language of ['zh', 'en'] as const) {
      for (const key of [...PANEL_KEYS, ...MARKET_KEYS]) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        for (const word of INTERNAL) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
      expect(dictionaries[language]['panels.market.defaultLabel']).toContain(
        language === 'zh' ? '默认' : 'default',
      );
    }
  });

  it('★ "恢复默认"这条旧文案已经删了（它做的是"配成空"，名不副实）', () => {
    for (const language of ['zh', 'en'] as const) {
      expect(dictionaries[language]['panels.reset' as never]).toBeUndefined();
    }
  });
});

describe('市场页头：动作在飞，页头与列表里的钮一起禁用', () => {
  it('★ 行里在装/在更新/在卸 → 两段区块头那颗刷新与「添加模块」都不许点（不然就是在同一条通道上叠第二笔）', () => {
    const page = readFileSync(new URL('../../market/panel.tsx', import.meta.url), 'utf8');
    const view = read('MarketView.tsx');
    const header = readFileSync(new URL('../../market/market-header.tsx', import.meta.url), 'utf8');
    const check = readFileSync(new URL('../../market/market-check.tsx', import.meta.url), 'utf8');
    const transient = read('market-transient-state.ts');

    expect(page).toMatch(/marketSettled\(shownFreshness, shownRead\) \|\| acting/);
    expect(page).toContain('busy={busy}');
    expect(page).not.toContain('onReload');
    expect(page).toContain('updatesCheckedAt={versionsCheckedAt}');
    expect(page).toContain('onPending={setActing}');
    expect(view).toContain('scope="modules"');
    expect(view).toContain('scope="plugins"');
    expect(view).toContain('headAction={pluginCheck}');
    expect(view).toContain('disabled={pending !== null}');
    expect(header).not.toContain('IconRefreshOutlineRegular');
    expect(check).toContain('variant="ghost"');
    expect(check).toContain('disabled={disabled || checking}');
    expect(view).toContain('useMarketTransient({ mock, onPending })');
    expect(transient).toContain('onPending?.(pending !== null)');
  });
});
