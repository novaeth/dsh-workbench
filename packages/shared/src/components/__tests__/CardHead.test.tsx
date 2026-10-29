import { describe, expect, it } from 'vitest';
import { CardHead } from '../CardHead.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

const t = (key: string): string => key;

function head(overrides: Record<string, unknown> = {}): AnyElement {
  return CardHead({
    t,
    title: '套餐余额',
    refreshing: false,
    onRefresh: () => {},
    ...overrides,
  } as never) as unknown as AnyElement;
}

function allChildren(node: AnyElement): AnyElement[] {
  const raw = node.props['children'];
  return (Array.isArray(raw) ? raw : [raw]).filter(
    (one): one is AnyElement => typeof one === 'object' && one !== null && 'props' in (one as AnyElement),
  );
}

function find(root: AnyElement, hit: (node: AnyElement) => boolean): AnyElement | undefined {
  for (const child of allChildren(root)) {
    if (hit(child)) return child;
    const deeper = find(child, hit);
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}

function byClass(root: AnyElement, needle: string): AnyElement | undefined {
  return find(root, (node) => {
    const className = node.props['className'];
    return typeof className === 'string' && className.includes(needle);
  });
}

function byLabel(root: AnyElement, label: string): AnyElement | undefined {
  return find(root, (node) => node.props['aria-label'] === label);
}

describe('CardHead 的那颗 ↗：platformHref 一个人说了算', () => {
  it('只给 platformHref 也画得出来（少给 platform 不再静默丢一颗按钮）', () => {
    const anchor = byClass(head({ platformHref: 'https://example.com/wallet' }), 'wb-cardOpen');
    expect(anchor).toBeDefined();
    expect(anchor?.props['href']).toBe('https://example.com/wallet');
    expect(anchor?.props['target']).toBe('_blank');
    expect(anchor?.props['rel']).toBe('noreferrer noopener');
  });

  it('platformHref 不给就一颗都不画（不是画一颗没有链接的）', () => {
    expect(byClass(head(), 'wb-cardOpen')).toBeUndefined();
    expect(byClass(head({ platform: 'LLM Gateway' }), 'wb-cardOpen')).toBeUndefined();
    expect(byClass(head({ platformTitle: '在 LLM Gateway 里打开钱包' }), 'wb-cardOpen')).toBeUndefined();
  });

  it('aria-label：platform 优先，其次 platformTitle，都没有就退回那句话', () => {
    expect(byClass(head({ platformHref: '/x' }), 'wb-cardOpen')?.props['aria-label']).toBe(
      'rightbar.openPlatform',
    );
    expect(byClass(head({ platformHref: '/x', platform: 'LLM Gateway' }), 'wb-cardOpen')?.props['aria-label']).toBe(
      'LLM Gateway',
    );
    expect(
      byClass(head({ platformHref: '/x', platformTitle: '在 LLM Gateway 里打开钱包' }), 'wb-cardOpen')?.props[
        'aria-label'
      ],
    ).toBe('在 LLM Gateway 里打开钱包');
  });

  it('刷新那颗永远在（有没有 ↗ 都不影响它）', () => {
    expect(byLabel(head(), 'rightbar.refresh')).toBeDefined();
    expect(byLabel(head({ platformHref: '/x' }), 'rightbar.refresh')).toBeDefined();
  });
});
