import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FormRow, FormRows } from './FormRows.js';

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

function noteNodeOf(node: unknown, className: string): unknown {
  return childrenOf(node).find(
    (one) => (one as { props?: Record<string, unknown> } | null)?.props?.['className'] === className,
  );
}

describe('FormRow', () => {
  it('标签、控件、提示按顺序出现（提示排在控件下面那一格）', () => {
    expect(texts(FormRow({ label: '项目', hint: '选错了也能改', children: '下拉' }))).toEqual([
      '项目',
      '下拉',
      '选错了也能改',
    ]);
  });

  it('默认是「标签在左」的两列；stacked 才是上下堆叠', () => {
    const inline = FormRow({ label: '项目', children: '下拉' }) as unknown as { props: Record<string, unknown> };
    const stacked = FormRow({ label: '项目', layout: 'stacked', children: '下拉' }) as unknown as {
      props: Record<string, unknown>;
    };

    expect(inline.props['data-layout']).toBe('inline');
    expect(stacked.props['data-layout']).toBe('stacked');
    expect(inline.props['className']).toBe('wb-formRow');
  });

  it('没给提示就不多一个空节点（否则每行都空一截）', () => {
    const node = FormRow({ label: '项目', children: '下拉' });

    expect(texts(node)).toEqual(['项目', '下拉']);
    expect(childrenOf(node).filter((one) => one !== null)).toHaveLength(2);
  });

  it('★ 行是 <div>，<label> 只包标签文字 —— 控件、提示与整行空白都不在标签里', () => {
    const node = FormRow({
      label: '项目',
      htmlFor: 'wb-form-project',
      hint: '选错了也能改',
      children: '下拉',
    }) as unknown as { type: unknown; props: { children: unknown[] } };
    const [labelNode, controlNode, hintNode] = node.props.children as {
      type: unknown;
      props: Record<string, unknown>;
    }[];

    expect(node.type).toBe('div');
    expect(labelNode?.type).toBe('label');
    expect(labelNode?.props['htmlFor']).toBe('wb-form-project');
    expect(texts(labelNode)).toEqual(['项目']);
    expect(controlNode?.props['className']).toBe('wb-formControl');
    expect(hintNode?.props['className']).toBe('wb-formHint');
  });

  it('没给 htmlFor 就不挂 for（排布照旧，只是点标签不聚焦）', () => {
    const node = FormRow({ label: '项目', children: '下拉' }) as unknown as {
      props: { children: unknown[] };
    };
    const labelNode = node.props.children[0] as { props: Record<string, unknown> };

    expect(labelNode.props['htmlFor']).toBeUndefined();
  });

  it('有 problem 就顶掉 hint（同一格，二选一），错误行挂 data-wb-problem 给聚焦那件找', () => {
    const node = FormRow({
      label: '项目',
      hint: '只列非生产',
      problem: '这个项目不存在',
      children: '下拉',
    }) as unknown as { props: Record<string, unknown> };

    expect(texts(node)).toEqual(['项目', '下拉', '这个项目不存在']);
    expect((noteNodeOf(node, 'wb-formProblem') as { props: Record<string, unknown> }).props['className']).toBe(
      'wb-formProblem',
    );
    expect(node.props['data-wb-problem']).toBe('');
  });

  it('没有 problem 就不多挂标记，hint 照常', () => {
    const node = FormRow({ label: '项目', hint: '只列非生产', children: '下拉' }) as unknown as {
      props: Record<string, unknown>;
    };

    expect(node.props['data-wb-problem']).toBeUndefined();
    expect(noteNodeOf(node, 'wb-formHint')).toBeDefined();
    expect(noteNodeOf(node, 'wb-formProblem')).toBeUndefined();
    expect(texts(node)).toEqual(['项目', '下拉', '只列非生产']);
  });

  it('FormRows 只是一列容器，不替调用点决定格子', () => {
    const node = FormRows({ children: '两行' }) as unknown as { props: Record<string, unknown> };

    expect(node.props['className']).toBe('wb-formRows');
    expect(texts(node)).toEqual(['两行']);
  });
});

const FORM_CSS = readFileSync(new URL('./FormRows.css', import.meta.url), 'utf8');

function normalize(selector: string): string {
  return selector
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function selectorParts(head: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of head) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(normalize(current));
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(normalize(current));
  return parts;
}

function declarations(selector: string): string[] {
  for (const block of FORM_CSS.split('}')) {
    const [head, ...rest] = block.split('{');
    if (rest.length === 0 || head === undefined) continue;
    if (!selectorParts(head).includes(normalize(selector))) continue;
    return rest
      .join('{')
      .split(';')
      .map((one) => one.replace(/\s+/g, ' ').trim())
      .filter((one) => one !== '');
  }
  throw new Error(`FormRows.css 里没有这条规则：${selector}`);
}

describe('标签列：同一个 FormRows 共用一列（ADR-0052 §11）', () => {
  it('★ FormRows 自己是一个 grid：标签列 minmax(72px, max-content)，行距还是那一档', () => {
    const rows = declarations('.wb-formRows');

    expect(rows).toContain('display: grid');
    expect(rows).toContain('grid-template-columns: minmax(72px, max-content) minmax(0, 1fr)');
    expect(rows).toContain('row-gap: var(--wb-len-12)');
  });

  it('★ 行先留回退两列，再由 subgrid 继承父网格那两列（老浏览器丢掉 subgrid 仍有回退）', () => {
    expect(declarations('.wb-formRow')).toContain(
      'grid-template-columns: minmax(72px, max-content) minmax(0, 1fr)',
    );
    expect(declarations('.wb-formRows > .wb-formRow')).toContain('grid-template-columns: subgrid');
  });

  it('★ 行自己的列距与 FormRows 那一档同值（不同值就是控件起点参差）', () => {
    const rowGap = declarations('.wb-formRow').find((one) => one.startsWith('column-gap:'));
    const rowsGap = declarations('.wb-formRows').find((one) => one.startsWith('column-gap:'));

    expect(rowGap).toBe('column-gap: var(--wb-len-8)');
    expect(rowGap).toBe(rowsGap);
  });

  it('★ 标签不折行；stacked 还是单列、标签照常换行', () => {
    expect(declarations('.wb-formLabel')).toContain('white-space: nowrap');
    expect(declarations('.wb-formLabel')).toContain('justify-self: start');
    expect(declarations(".wb-formRow[data-layout='stacked'] .wb-formLabel")).toContain(
      'white-space: normal',
    );
    expect(declarations(".wb-formRow[data-layout='stacked']")).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    );
  });

  it('★ stacked 行在 FormRows 里也压得过 subgrid 与那条回退（同权重、靠后那条赢过的老坑）', () => {
    expect(declarations(".wb-formRows > .wb-formRow[data-layout='stacked']")).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    );
  });

  it('★ stacked 行里 hint / problem 通栏（它们的 grid-column: 2 会造出隐式第二列）', () => {
    expect(declarations(".wb-formRow[data-layout='stacked'] .wb-formHint")).toContain(
      'grid-column: 1 / -1',
    );
    expect(declarations(".wb-formRow[data-layout='stacked'] .wb-formProblem")).toContain(
      'grid-column: 1 / -1',
    );
  });

  it('★ 不是 FormRow 的子项（分组标题那种）通栏，别被塞进标签那一列', () => {
    expect(declarations('.wb-formRows > :not(.wb-formRow)')).toContain('grid-column: 1 / -1');
  });
});

const EXCLUDED_INPUT_TYPES = [
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'image',
  'color',
  'range',
];
const CONTROL_FILL_SELECTOR = `.wb-formControl > :where(.wb-selectAnchor, .wb-choiceMenu, input:not(${EXCLUDED_INPUT_TYPES.map((one) => `[type='${one}']`).join(', ')}), select, textarea)`;

describe('控件槽那一格：字段控件铺满，宽度不归调用点写（ADR-0052 §13）', () => {
  it('★ 那一格里的字段控件吃满控件槽：border-box + width 100% + min-width 0', () => {
    const fill = declarations(CONTROL_FILL_SELECTOR);

    expect(fill).toContain('box-sizing: border-box');
    expect(fill).toContain('width: 100%');
    expect(fill).toContain('min-width: 0');
  });

  it('★ 开关与按钮那一族不在名单里（拉宽一颗 switch、一颗 <input type=submit> 就是另一回事）', () => {
    for (const type of EXCLUDED_INPUT_TYPES) {
      expect(CONTROL_FILL_SELECTOR).toContain(`[type='${type}']`);
    }
    expect(FORM_CSS).not.toMatch(/\.wb-formControl\s*>\s*\*/);
  });
});
