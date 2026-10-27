import { describe, expect, it } from 'vitest';
import { dismissPanelByPointer, hasOpenModal } from '../panel-dismiss';

function scope(hit: boolean): ParentNode {
  return {
    querySelector: (selector: string) => (hit && selector === '[aria-modal="true"]' ? {} : null),
  } as unknown as ParentNode;
}

describe('面板 popover 的"点外面收摊"：浮层不算外面', () => {
  it('★ dsh 的 Modal 是 createPortal 到 body 的：点浮层里不许把面板一起关掉', () => {
    const seen: boolean[] = [];

    dismissPanelByPointer(false, scope(true), (next) => seen.push(next));

    expect(seen).toEqual([]);
  });

  it('★ 没有浮层时照旧收摊（不然点外面关不掉了）', () => {
    const seen: boolean[] = [];

    dismissPanelByPointer(false, scope(false), (next) => seen.push(next));

    expect(seen).toEqual([false]);
  });

  it('浮层开着也照旧能"打开"（收摊那条路才需要让）', () => {
    const seen: boolean[] = [];

    dismissPanelByPointer(true, scope(true), (next) => seen.push(next));

    expect(seen).toEqual([true]);
  });

  it('认的是 dsh 钉在浮层上的那颗 `aria-modal`（面板自己是 role=dialog，不吃这条）', () => {
    expect(hasOpenModal(scope(true))).toBe(true);
    expect(hasOpenModal(scope(false))).toBe(false);
  });
});
