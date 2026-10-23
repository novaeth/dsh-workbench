import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/react.js', () => ({
  h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
}));

import { Card, type CardProps } from './Card.js';

const t = (key: string): string => key;

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: unknown[];
}

function card(extra: Partial<CardProps> = {}): AnyElement {
  return Card({
    t,
    title: '目录概览',
    refreshing: false,
    onRefresh: () => {},
    children: null,
    ...extra,
  }) as unknown as AnyElement;
}

function headOf(root: AnyElement): AnyElement {
  return root.children[0] as AnyElement;
}

describe('卡壳（契约类 wb-card，第三方模块自己写也认这套）', () => {
  it('★ 卡壳就是 section.wb-card + .wb-cardBody，里面是卡头与内容', () => {
    const root = card();

    expect(root.type).toBe('section');
    expect(root.props['className']).toBe('wb-card');
    expect(headOf(root).type).not.toBe('section');
    expect((root.children[1] as AnyElement).props['className']).toBe('wb-cardBody');
  });

  it('★ 卡自己不带 id：这张卡是谁由外壳的锚点盖（模块装的是哪一代构建都不影响）', () => {
    expect(card().props['id']).toBeUndefined();
    expect(card({ head: null }).props['id']).toBeUndefined();
  });
});
