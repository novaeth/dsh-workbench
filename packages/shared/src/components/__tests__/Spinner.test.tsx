import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/react.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/react.js')>('../../lib/react.js');
  return { ...actual, h: (type: unknown, props?: unknown, ...children: unknown[]) => ({ type, props: props ?? {}, children }) };
});
vi.mock('../Spinner.css', () => ({ default: {} }));

import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from '../Spinner.js';

describe('Spinner（loading 那颗）', () => {
  it('画的是 dsh 的 ongoing 状态点（视觉只有这一处实现）', () => {
    const node = Spinner({ size: 12 }) as unknown as { children: readonly { type: unknown; props: Record<string, unknown> }[] };

    expect(node.children[0]?.type).toBe(StateDot);
    expect(node.children[0]?.props['state']).toBe('ongoing');
    expect(node.children[0]?.props['size']).toBe(12);
  });

  it('没给 label 时对读屏隐藏（它是装饰，话由旁边的文案说）', () => {
    const node = Spinner({}) as unknown as { props: Record<string, unknown> };

    expect(node.props['aria-hidden']).toBe(true);
    expect(node.props['role']).toBeUndefined();
  });

  it('给了 label 就是一条状态播报', () => {
    const node = Spinner({ label: '正在读环境' }) as unknown as { props: Record<string, unknown> };

    expect(node.props['role']).toBe('status');
    expect(node.props['aria-label']).toBe('正在读环境');
    expect(node.props['aria-hidden']).toBeUndefined();
  });
});
