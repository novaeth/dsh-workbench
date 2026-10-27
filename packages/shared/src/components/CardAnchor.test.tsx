import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/react.js', () => ({
  h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
}));

vi.mock('./CardAnchor.module.css', () => ({ default: { anchor: 'wb-anchor' } }));

import { CardAnchor, cardIdOf } from './CardAnchor.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: unknown[];
}

function anchor(unit: string): AnyElement {
  return CardAnchor({ unit, children: 'card' }) as unknown as AnyElement;
}

describe('外壳给每张卡盖的锚点', () => {
  it('★★ 锚点就是 #wb-card-<unit>，卡在外面量不出盒子也不动布局（display: contents）', () => {
    const root = anchor('demo');

    expect(root.type).toBe('div');
    expect(root.props['id']).toBe('wb-card-demo');
    expect(root.props['className']).toBe('wb-anchor');
    expect(root.children).toEqual(['card']);
  });

  it('★ 名字由 unit 拼出来：空 unit 不给 id（一个页面里 id 必须唯一）', () => {
    expect(cardIdOf(null)).toBeUndefined();
    expect(cardIdOf('')).toBeUndefined();
    expect(cardIdOf('inventory')).toBe('wb-card-inventory');
  });
});
