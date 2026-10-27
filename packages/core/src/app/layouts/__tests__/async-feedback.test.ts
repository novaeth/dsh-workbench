import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@dsh-workbench/shared';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('每一次异步操作都要自己显形（ADR-0039）', () => {
  it('★ 本地写那一档：控件自己压暗 + 有可见下限（面板行、市场那颗默认拨钮）', () => {
    expect(read('rightbar/ModulesPage.tsx')).toContain('useVisibleBusy(writing || settle.pending, MIN_BUSY_MS)');
    expect(read('rightbar/MarketView.tsx')).toContain(
      'useVisibleBusy(writingDefault || settleDefault.pending, MIN_BUSY_MS)',
    );
  });

  it('★ 那一档的解禁要等读数回来：写响应回来还不算（不然宿主慢一拍就是"先解禁、后变色"）', () => {
    const page = read('rightbar/ModulesPage.tsx');
    const market = read('rightbar/MarketView.tsx');
    const settle = read('rightbar/panel-write.ts');

    expect(page).toContain('useBoardSettle(panelBoardSignature(units, plugins, own))');
    expect(page).toContain('settle.begin()');
    expect(page).toContain('settle.clear()');
    expect(market).toContain('useBoardSettle(machineBoardSignature(defaults, changed))');
    expect(market).toContain('settleDefault.begin()');
    expect(market).toContain('settleDefault.clear()');
    expect(settle).toContain('setHeld((current) => nextPending(current, signature))');
    expect(settle).toContain('setTimeout(() => setHeld(null), PANEL_SETTLE_MS)');
  });

  it('★ 秒级那一档：行内有进度文字 + 转圈那颗，不是只有按钮禁用', () => {
    const row = read('rightbar/market-section.tsx');
    const add = read('market/AddModuleDialog.tsx');

    expect(row).toContain('PROGRESS_KEY[running.action]');
    expect(row).toContain('<Spinner size={14} />');
    expect(add).toContain("t(state.removing ? 'panels.market.uninstalling' : 'panels.market.add.remove')");
    expect(add).toContain('disabled={state.removing}');
  });

  it('★ 快的那一档不许一闪：下限常量只认 MIN_BUSY_MS（不是各处自己写毫秒）', () => {
    for (const file of ['rightbar/ModulesPage.tsx', 'rightbar/MarketView.tsx']) {
      expect(read(file), file).not.toMatch(/useVisibleBusy\([^)]*,\s*\d/);
    }
  });

  it('★ 失败落在原地：新建工作区给红字、重命名给 failed，不许只 console', () => {
    const sidebar = read('sidebar/Sidebar.tsx');

    expect(sidebar).toContain('wb-workspaceError');
    expect(sidebar).toContain("t('project.add.failed')");
    expect(read('sidebar/WorkspaceRenameDialog.tsx')).toContain('setFailed(true)');
  });

  it('★ 新补的两句反馈文案两语言都在，且不说内部词', () => {
    for (const language of ['zh', 'en'] as const) {
      for (const key of ['project.add.busy', 'project.add.failed'] as const) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        for (const word of ['外壳', '协议', '清单', 'apiVersion']) {
          expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
        }
      }
    }
  });
});
