import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');
const flat = (text: string): string => text.replace(/\s+/g, ' ');

const VIEW = read('ModulesPage.tsx');
const CSS = read('ModulesPage.module.css');

describe('拖动排序的落点接线（未开启的行不是落点、也没有拖把）', () => {
  it('★ 落点由 panelDropTarget 判：没开的那一行、无看板的那一行都给 null（不亮高亮条）', () => {
    expect(flat(VIEW)).toContain('panelDropTarget(carded, rowAtPoint(rowBoxes(listRef.current), y));');
    expect(read('board-selection.ts')).toContain('row?.shown === true && row.hasCard !== false ? index : null');
  });

  it('★ 拖把只长在"开着 + 有看板"的行上：未开启的不给拖把，无看板模块根本不进这个列表（走分组那一份）', () => {
    expect(flat(VIEW)).toContain("{row.shown && row.hasCard !== false ? ( <Tip key={tipEpoch} label={t('panels.dragHint')} disabled={drag !== null}>");
    expect(flat(VIEW)).toContain('if (carded[index]?.shown !== true) return;');
    expect(flat(VIEW)).toContain('const carded: PanelRow[] = modules.filter((row) => row.hasCard !== false);');
    expect(VIEW).not.toContain('draggable');
  });

  it('★ 起手不许换 DOM 节点：换了的话 dsh「点外面收摊」拿到的是个已摘下来的 target，弹层会被一起收掉', () => {
    expect((VIEW.match(/<Tip [^>]*label=\{t\('panels\.dragHint'\)\}/g) ?? []).length).toBe(1);
    expect(flat(VIEW)).toContain('<Tip key={tipEpoch} label');
    expect(VIEW).not.toContain('drag === null ? (');
  });

  it('★ 松手时换一次 key 重挂提示：气泡的"显示中"是 Tooltip 自己的状态，只有重挂才清得掉', () => {
    expect(VIEW).toContain('key={tipEpoch}');
    expect(VIEW).toContain('setTipEpoch((epoch) => epoch + 1)');
  });

  it('★ Tip 的孩子必须是真元素：dsh 的 Tooltip 靠 cloneElement 把 ref 与悬停事件挂到孩子上，孩子是个组件就全丢了（提示再也不出来）', () => {
    expect(
      flat(VIEW),
    ).toContain("<Tip key={tipEpoch} label={t('panels.dragHint')} disabled={drag !== null}> <span");
    expect(VIEW).not.toContain('<Grip');
  });

  it('★ 光标归我们管（原生拖放那套控不了光标）：拖动中给 grabbing / not-allowed', () => {
    expect(VIEW).toContain('styles.gripBlocked');
    expect(VIEW).toContain('styles.rowBlocked');
    expect(CSS).toMatch(/\.gripBlocked \{[^}]*cursor: not-allowed/);
    expect(CSS).toMatch(/\.rowBlocked \{[^}]*cursor: not-allowed/);
    expect(CSS).toMatch(/\.grip \{[^}]*cursor: grab/);
    expect(CSS).not.toMatch(/\.row \{[^}]*cursor: grab/);
  });

  it('★ 拖动走指针事件（原生 dragstart 一挂上，光标又不受我们管了）', () => {
    expect(VIEW).toContain('setPointerCapture(event.pointerId)');
    expect(VIEW).not.toContain('dataTransfer');
  });

  it('★ 收尾挂在整个窗口上：松手落在气泡 / 浮层外 / 指针捕获丢了，拖拽都收得回来', () => {
    const listeners = read('use-drag-listeners.ts');

    expect(listeners).toContain("window.addEventListener('pointermove', onMove)");
    expect(listeners).toContain("window.addEventListener('pointerup', onUp)");
    expect(listeners).toContain("window.addEventListener('pointercancel', onCancel)");
    expect(listeners).toContain("window.removeEventListener('pointerup', onUp)");
    expect(VIEW).toContain('useDragListeners(drag !== null, handlers)');
    expect(VIEW).not.toContain('onPointerUp=');
    expect(VIEW).not.toContain('onPointerMove=');
    expect(VIEW).not.toContain('onLostPointerCapture');
  });

  it('★ 松手时落点为空 = 拖到未开启的行上（或拖出去了）：不写配置', () => {
    expect(flat(VIEW)).toContain('if (moved === undefined || over === null || over === from) return;');
    expect(flat(VIEW)).toContain("void write({ action: 'move', id: moved.id, index: over });");
  });
});
