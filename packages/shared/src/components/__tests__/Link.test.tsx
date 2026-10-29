import { describe, expect, it } from 'vitest';
import { Link } from '../Link.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

function kids(node: AnyElement): unknown[] {
  return (node.props['children'] as unknown[]).filter((one) => one !== null);
}

describe('Link', () => {
  it('外链：新窗口 + noopener，自带那个外链小箭头（就这一套，不许去不许换）', () => {
    const node = Link({ href: 'https://example.com', children: '去网关看账单' }) as unknown as AnyElement;
    expect(node.props['className']).toBe('wb-link');
    expect(node.props['href']).toBe('https://example.com');
    expect(node.props['target']).toBe('_blank');
    expect(node.props['rel']).toBe('noopener noreferrer');
    expect(kids(node)).toHaveLength(2);
  });

  it('同窗口（external: false）不给 target，也不带外链箭头', () => {
    const node = Link({ href: '/x', children: '本地', external: false }) as unknown as AnyElement;
    expect(node.props['target']).toBeUndefined();
    expect(kids(node)).toHaveLength(1);
  });

  it('title 给了才带上；className 只用来加布局（不改样子）', () => {
    const bare = Link({ href: '/x', children: 'x' }) as unknown as AnyElement;
    expect(bare.props['title']).toBeUndefined();
    const titled = Link({ href: '/x', children: 'x', title: '去网关看账单' }) as unknown as AnyElement;
    expect(titled.props['title']).toBe('去网关看账单');
    const spaced = Link({ href: '/x', children: 'x', className: 'wb-longTaskLink' }) as unknown as AnyElement;
    expect(spaced.props['className']).toBe('wb-link wb-longTaskLink');
  });
});
