import { describe, expect, it } from 'vitest';
import { STYLE_MARKER, installWorkbenchStyles } from '../layouts/workbench-styles';

type Doc = Parameters<typeof installWorkbenchStyles>[1];

function fakeDocument() {
  const nodes: Array<{
    attrs: Record<string, string>;
    textContent: string;
    getAttribute: (name: string) => string | null;
  }> = [];
  const doc = {
    head: { appendChild: (node: unknown) => nodes.push(node as never) },
    createElement: () => {
      const attrs: Record<string, string> = {};
      return {
        attrs,
        setAttribute: (name: string, value: string) => {
          attrs[name] = value;
        },
        getAttribute: (name: string) => attrs[name] ?? null,
        textContent: '',
      };
    },
    querySelector: (selector: string) =>
      selector.includes(STYLE_MARKER)
        ? (nodes.find((node) => node.getAttribute(STYLE_MARKER) !== null) ?? null)
        : null,
  };
  return { doc: doc as unknown as Doc, nodes };
}

describe('工作台那份文档级样式', () => {
  it('★ 只装一次、就地更新，且**不摘掉**：摘掉它 = 卡还在、var() 全成未定义', () => {
    const { doc, nodes } = fakeDocument();
    installWorkbenchStyles(':root { --wb-len-10: 10px; }', doc);
    installWorkbenchStyles(':root { --wb-len-10: 12px; }\n.wb-cardHead { gap: var(--wb-len-10); }', doc);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.getAttribute(STYLE_MARKER)).toBe('');
    expect(nodes[0]?.textContent).toContain('--wb-len-10: 12px');
    expect(nodes[0]?.textContent).toContain('.wb-cardHead');
  });
});
