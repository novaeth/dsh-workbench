import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Row, Rows } from './Rows.js';

function texts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((one) => texts(one));
  const element = node as { props?: { children?: unknown } };
  return texts(element.props?.children);
}

function childrenOf(node: unknown): unknown[] {
  return (node as { props: { children: unknown } }).props.children as unknown[];
}

describe('Row', () => {
  it('键、值按顺序落在两个 span 里（样式那两条选择器认的就是它们、且就认这一层）', () => {
    const node = Row({ label: '环境', value: '生产' }) as unknown as {
      props: Record<string, unknown>;
    };
    const children = childrenOf(node) as { props: Record<string, unknown> }[];

    expect(node.props['className']).toBe('wb-row');
    expect(children.map((one) => one.props['className'])).toEqual(['wb-rowKey', 'wb-rowValue']);
    expect(texts(node)).toEqual(['环境', '生产']);
  });

  it('Rows 只是一层容器，不替调用点决定格子', () => {
    const node = Rows({ children: '两行' }) as unknown as { props: Record<string, unknown> };

    expect(node.props['className']).toBe('wb-rows');
    expect(texts(node)).toEqual(['两行']);
  });
});

const ROWS_CSS = readFileSync(new URL('./Rows.css', import.meta.url), 'utf8');
const FLEX_CONTAINER = `.wb-rows {
  display: flex;
  flex-direction: column;
}`;

function declarationsIn(css: string, selector: string): string[] {
  for (const block of css.split('}')) {
    const [head, ...rest] = block.split('{');
    if (rest.length === 0 || head === undefined) continue;
    if (head.trim() !== selector) continue;
    return rest
      .join('{')
      .split(';')
      .map((one) => one.replace(/\s+/g, ' ').trim())
      .filter((one) => one !== '');
  }
  throw new Error(`Rows.css 里没有这条规则：${selector}`);
}

function declarations(selector: string): string[] {
  return declarationsIn(ROWS_CSS, selector);
}

function containerIsGrid(css: string): boolean {
  return declarationsIn(css, '.wb-rows').includes('display: grid');
}

describe('标签列：同一个 Rows 共用一列（ADR-0052 §12）', () => {
  it('★ 容器自己必须是网格 —— 不是网格项的元素上 subgrid 算 none，两行当场塌成一列', () => {
    expect(containerIsGrid(ROWS_CSS)).toBe(true);
    expect(declarations('.wb-rows')).toContain(
      'grid-template-columns: minmax(72px, max-content) minmax(0, 1fr)',
    );
  });

  it('★ 反例：容器写回 flex（0.2.16 那次事故）—— 同一条判据当场判它不是网格', () => {
    expect(containerIsGrid(FLEX_CONTAINER)).toBe(false);
    expect(declarationsIn(FLEX_CONTAINER, '.wb-rows')).toContain('display: flex');
  });

  it('★ 行先留回退两列，再由 subgrid 继承父网格那两列；行自己还得通栏', () => {
    expect(declarations('.wb-row')).toContain(
      'grid-template-columns: minmax(72px, max-content) minmax(0, 1fr)',
    );
    expect(declarations('.wb-row')).toContain('grid-column: 1 / -1');
    expect(declarations('.wb-rows > .wb-row')).toContain('grid-template-columns: subgrid');
  });

  it('★ 不是 Row 的子项（分组标题那种）通栏，别被塞进标签那一列', () => {
    expect(declarations('.wb-rows > :not(.wb-row)')).toContain('grid-column: 1 / -1');
  });

  it('★ 两处列距同值（subgrid 用的是行自己那条：不同值就是值左沿参差）', () => {
    const rowGap = declarations('.wb-row').find((one) => one.startsWith('gap:'));
    const rowsGap = declarations('.wb-rows').find((one) => one.startsWith('column-gap:'));

    expect(rowGap).toBe('gap: var(--wb-len-8)');
    expect(rowsGap).toBe('column-gap: var(--wb-len-8)');
  });

  it('★ 标签不折行；值那一格能缩、长值能断词', () => {
    expect(declarations('.wb-rowKey')).toContain('white-space: nowrap');
    expect(declarations('.wb-rowValue')).toContain('min-width: 0');
    expect(declarations('.wb-rowValue')).toContain('overflow-wrap: anywhere');
  });

  it('★ 老浏览器解析期就丢掉 subgrid 那条 ⇒ 回退那两列仍要在册', () => {
    expect(ROWS_CSS).toContain('@supports not (grid-template-columns: subgrid)');
    expect(ROWS_CSS).toContain('.wb-rows > .wb-row');
  });
});
