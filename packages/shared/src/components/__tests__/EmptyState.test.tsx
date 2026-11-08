import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/react.js', () => ({
  h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
}));

import { CenteredState, EmptyState } from '../ResourceStates.js';
import { EmptyIllustration } from '../EmptyIllustration.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: unknown[];
}

describe('空态默认就带插画', () => {
  it('★ 不给 icon：用空态插画，标题就是那句空态文案', () => {
    const root = EmptyState({ text: '一条都还没有' }) as unknown as AnyElement;
    expect(root.type).toBe(CenteredState);
    expect(root.props['title']).toBe('一条都还没有');
    const icon = root.props['icon'] as AnyElement;
    expect(icon.type).toBe(EmptyIllustration);
  });

  it('★ 要纯文字：给 null 就不画', () => {
    const root = EmptyState({ text: '空', icon: null }) as unknown as AnyElement;
    expect(root.props['icon']).toBeNull();
  });

  it('★ 自己有图标：原样透传', () => {
    const root = EmptyState({ text: '空', icon: 'x' }) as unknown as AnyElement;
    expect(root.props['icon']).toBe('x');
  });
});
