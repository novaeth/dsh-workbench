import { describe, expect, it, vi } from 'vitest';

let states: unknown[] = [];
vi.mock('../../lib/react.js', () => ({
  Fragment: Symbol.for('react.fragment'),
  h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
  useEffect: () => {},
  useMemo: (compute: () => unknown) => compute(),
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => [states.length > 0 ? states.shift() : initial, () => {}],
}));

vi.mock('../SelectField.css', () => ({ default: {} }));

import { Menu, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from '../Spinner.js';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../../lib/react.js';
import { Field } from '../Field.js';
import { TextField } from '../TextField.js';
import {
  SelectField,
  defaultSelectFilter,
  selectCursorValue,
  selectEntries,
  stepSelectCursor,
} from '../SelectField.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children?: unknown;
}

function childrenOf(element: AnyElement): unknown {
  return element.children ?? element.props['children'];
}

function collect(node: unknown, out: AnyElement[] = []): AnyElement[] {
  if (node === null || node === void 0 || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') return out;
  if (Array.isArray(node)) {
    for (const one of node) collect(one, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  const element = node as AnyElement;
  out.push(element);
  collect(childrenOf(element), out);
  return out;
}

function elementsOf(root: unknown): readonly AnyElement[] {
  return collect(root);
}

function menuOf(root: unknown): AnyElement {
  const menu = elementsOf(root).find((one) => one.type === Menu);
  if (menu === undefined) throw new Error('没有渲染出 Menu');
  return menu;
}

function inputOf(root: unknown): AnyElement | undefined {
  return elementsOf(root).find((one) => one.type === TextField);
}

function render(props: Record<string, unknown>, state: readonly unknown[] = []): unknown {
  states = [...state];
  return SelectField({
    value: 'b',
    options: OPTIONS,
    onChange: () => {},
    ...props,
  } as never);
}

const OPTIONS = [
  { value: 'a', label: '工作区甲', group: '工作区' },
  { value: 'b', label: '工作区乙', group: '工作区' },
  { value: 'c', label: '默认工作区', group: '默认' },
];

describe('SelectField：工作区那套下拉的公共形状', () => {
  it('关着：触发钮上是当前选项，菜单条目已经按分组排好', () => {
    const root = render({});
    const menu = menuOf(root);

    expect(menu.props['open']).toBe(false);
    expect(menu.props['listClassName']).toContain('wb-selectMenu');
    const trigger = elementsOf(menu.props['anchor']).find((one) => one.type === 'button');
    expect(trigger?.props['aria-haspopup']).toBe('listbox');
    expect(trigger?.props['aria-expanded']).toBe(false);
    expect(JSON.stringify(trigger?.children)).toContain('工作区乙');

    const items = menu.props['items'] as readonly MenuEntry[];
    expect(items).toEqual([
      { type: 'label', id: '__wb-select-group-0', text: '工作区' },
      { id: 'a', label: '工作区甲' },
      { id: 'b', label: '工作区乙' },
      { type: 'label', id: '__wb-select-group-3', text: '默认' },
      { id: 'c', label: '默认工作区' },
    ]);
  });

  it('开着：锚点换成搜索框（这是这套交互的要点）', () => {
    const root = render({}, [true, '', null]);
    const menu = menuOf(root);

    expect(menu.props['open']).toBe(true);
    const anchor = elementsOf(menu.props['anchor']);
    const box = anchor.find((one) => one.props['className'] === 'wb-selectSearch');
    expect(box).toBeDefined();
    expect(anchor.some((one) => one.type === 'button')).toBe(false);
    expect(inputOf(menu.props['anchor'])?.props['value']).toBe('');
  });

  it('★ 只显示图标那一档（折叠左栏那个工作区钮）：没有值也没有箭头，读屏名字只能来自 ariaLabel', () => {
    const icon = { type: 'i', props: {}, children: [] };
    const trigger = elementsOf(
      menuOf(render({ variant: 'ghost', iconOnly: true, icon, ariaLabel: '切换项目' })).props['anchor'],
    ).find((one) => one.type === 'button');

    expect(trigger?.props['className']).toBe('wb-selectTrigger wb-selectGhost wb-selectIconOnly');
    expect(trigger?.props['aria-label']).toBe('切换项目');
    expect(JSON.stringify(trigger?.children)).not.toContain('wb-selectValue');
    expect(JSON.stringify(trigger?.children)).not.toContain('wb-selectChevron');
    expect(elementsOf(trigger?.children).some((one) => one.props['className'] === 'wb-selectIcon')).toBe(true);
  });

  it('不给 iconOnly 时一个字节都不变（宽态那套触发器照旧）', () => {
    const trigger = elementsOf(menuOf(render({ variant: 'ghost' })).props['anchor']).find(
      (one) => one.type === 'button',
    );

    expect(trigger?.props['className']).toBe('wb-selectTrigger wb-selectGhost');
    expect(JSON.stringify(trigger?.children)).toContain('wb-selectValue');
  });

  it('★ search=false：锚点仍是触发钮（折叠左栏那个下拉要的就是"点开直接是列表"）', () => {
    const root = render({ search: false });
    const anchor = elementsOf(menuOf(root).props['anchor']);

    expect(anchor.some((one) => one.type === 'button')).toBe(true);
    const classes = anchor.map((one) => one.props?.['className']).filter((one) => typeof one === 'string');
    expect(classes).not.toContain('wb-selectSearch');
    expect(inputOf(menuOf(root).props['anchor'])).toBeUndefined();
  });

  it('禁用：触发钮真的 disabled（压暗交给样式，别只在视觉上假装）', () => {
    const root = render({ disabled: true });
    const trigger = elementsOf(menuOf(root).props['anchor']).find((one) => one.type === 'button');

    expect(trigger?.props['disabled']).toBe(true);
  });

  it('默认是常规下拉框，无边框那一档要显式选（工作区切换器走的是它）', () => {
    const boxed = elementsOf(menuOf(render({})).props['anchor']).find(
      (one) => one.type === 'button',
    );
    expect(boxed?.props['className']).toBe('wb-selectTrigger');

    const ghost = elementsOf(menuOf(render({ variant: 'ghost' })).props['anchor']).find(
      (one) => one.type === 'button',
    );
    expect(ghost?.props['className']).toBe('wb-selectTrigger wb-selectGhost');

    const ghostSearch = elementsOf(
      menuOf(render({ variant: 'ghost' }, [true, '', null])).props['anchor'],
    ).find((one) => one.props['className'] === 'wb-selectSearch wb-selectGhost');
    expect(ghostSearch).toBeDefined();
  });

  it('搜索：按纯文本过滤（label 不是字符串时用 searchText）', () => {
    const root = render({}, [true, '默认', null]);
    const items = menuOf(root).props['items'] as readonly MenuEntry[];
    expect(items).toEqual([
      { type: 'label', id: '__wb-select-group-0', text: '默认' },
      { id: 'c', label: '默认工作区' },
    ]);

    states = [true, '甲', null];
    const byText = menuOf(
      SelectField({
        value: 'b',
        options: [{ value: 'a', label: <span>看不见的字</span>, searchText: '工作区甲' }],
        onChange: () => {},
      } as never),
    ).props['items'] as readonly MenuEntry[];
    expect(byText).toEqual([{ id: 'a', label: expect.anything() }]);
  });

  it('搜不到 / 加载中 / 空名单退化成手填，三种态各有明确落点', () => {
    const empty = render({ emptyText: '没有匹配的工作区' }, [true, 'zzz', null]);
    expect(menuOf(empty).props['items']).toEqual([
      { type: 'label', id: '__wb-select-empty__', text: '没有匹配的工作区' },
    ]);

    const withoutEmpty = render({}, [true, 'zzz', null]);
    expect(menuOf(withoutEmpty).props['items']).toEqual([]);

    const loading = render({ loading: true, loadingText: '正在读工作区' });
    const busy = elementsOf(loading).find((one) => one.type === 'button');
    expect(busy?.props['aria-busy']).toBe('true');
    expect(busy?.props['disabled']).toBe(true);
    expect(elementsOf(busy?.children).some((one) => one.type === TextShimmer)).toBe(true);
    expect(elementsOf(busy?.children).some((one) => one.type === Spinner)).toBe(true);

    const fallback = render({
      options: [],
      fallback: { value: '手填的', onChange: () => {} },
    });
    expect(inputOf(fallback)?.props['value']).toBe('手填的');
  });

  it('invalid：触发钮与退化成手填那格都挂 aria-invalid，没给就不挂', () => {
    const trigger = elementsOf(menuOf(render({ invalid: true })).props['anchor']).find(
      (one) => one.type === 'button',
    );
    expect(trigger?.props['aria-invalid']).toBe(true);

    const ok = elementsOf(menuOf(render({})).props['anchor']).find((one) => one.type === 'button');
    expect(ok?.props['aria-invalid']).toBeUndefined();

    const fallback = render({
      options: [],
      invalid: true,
      fallback: { value: '手填的', onChange: () => {} },
    });
    expect(inputOf(fallback)?.props['invalid']).toBe(true);
  });

  it('label / hint 走 Field，footer 那条动作独立成一行', () => {
    const root = render({ label: '工作区', hint: '三选一' });
    expect(elementsOf(root).some((one) => one.type === Field)).toBe(true);

    const footer = render({ footer: { label: '添加工作区…' }, onFooter: () => {} });
    expect(menuOf(footer).props['footer']).toEqual([
      { id: '__wb-select-footer__', label: '添加工作区…' },
    ]);
  });

  it('选中与页脚动作各给各的出口，选中之后菜单关掉', () => {
    const seen: string[] = [];
    const root = render({ onChange: (next: string) => seen.push(next) });
    (menuOf(root).props['onSelect'] as (id: string) => void)('c');
    expect(seen).toEqual(['c']);

    let added = 0;
    const withFooter = render({ footer: { label: '添加工作区…' }, onFooter: () => (added += 1) });
    (menuOf(withFooter).props['onSelect'] as (id: string) => void)('__wb-select-footer__');
    expect(added).toBe(1);
  });

  it('游标：从 null 起步、两头回绕、空名单不动', () => {
    expect(stepSelectCursor(OPTIONS, null, 1)).toBe(0);
    expect(stepSelectCursor(OPTIONS, null, -1)).toBe(2);
    expect(stepSelectCursor(OPTIONS, 2, 1)).toBe(0);
    expect(stepSelectCursor(OPTIONS, 0, -1)).toBe(2);
    expect(stepSelectCursor([], null, 1)).toBeNull();
    expect(selectCursorValue(OPTIONS, 9)).toBe('c');
    expect(selectCursorValue(OPTIONS, null)).toBeNull();
    expect(selectCursorValue([], 0)).toBeNull();
  });

  it('默认过滤：空查询全过、大小写不敏感、label 与 searchText 都认', () => {
    const option = { value: 'x', label: '腾讯云 · 生产' };
    expect(defaultSelectFilter(option, '  ')).toBe(true);
    expect(defaultSelectFilter(option, '生产')).toBe(true);
    expect(defaultSelectFilter({ value: 'x', label: <span>生产</span>, searchText: 'tencent-prod' }, 'TENCENT')).toBe(
      true,
    );
    expect(defaultSelectFilter(option, 'nope')).toBe(false);
  });

  it('条目构造：图标与禁用照传，分组标题只在换组时出现一次', () => {
    const items = selectEntries(
      [
        { value: 'a', label: '甲', group: 'G', disabled: true },
        { value: 'b', label: '乙', group: 'G', icon: <span>ico</span> },
      ],
      undefined,
    );
    expect(items).toEqual([
      { type: 'label', id: '__wb-select-group-0', text: 'G' },
      { id: 'a', label: '甲', disabled: true },
      { id: 'b', label: '乙', icon: expect.anything() },
    ]);
  });
});
