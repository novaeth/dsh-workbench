import { describe, expect, it } from 'vitest';
import { Field } from './Field.js';

function texts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((one) => texts(one));
  const element = node as { props?: { children?: unknown } };
  return texts(element.props?.children);
}

describe('Field', () => {
  it('标签、内容、提示按顺序出现', () => {
    expect(texts(Field({ label: '看几天', hint: '1..30', children: '输入框' }))).toEqual([
      '看几天',
      '输入框',
      '1..30',
    ]);
  });

  it('没给提示就不多一个空节点（否则每行都空一截）', () => {
    const node = Field({ label: '看几天', children: '输入框' }) as unknown as { props: { children: unknown[] } };
    expect(texts(node)).toEqual(['看几天', '输入框']);
    expect(node.props.children.filter((one) => one !== null)).toHaveLength(2);
  });
});
