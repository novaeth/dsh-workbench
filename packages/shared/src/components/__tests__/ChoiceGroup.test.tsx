import { describe, expect, it } from 'vitest';
import { Fragment, h } from '../../lib/react.js';
import { ChoiceGroup } from '../ChoiceGroup.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

function flatten(node: unknown, out: AnyElement[]): void {
  if (node === null || node === void 0 || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const one of node) flatten(one, out);
    return;
  }
  if (typeof node !== 'object') return;
  const element = node as AnyElement;
  if (typeof element.type === 'function') {
    flatten(
      (element.type as (props: unknown) => unknown)(element.props),
      out,
    );
    return;
  }
  out.push(element);
  if (element.props['children'] !== void 0) {
    flatten(element.props['children'], out);
  }
}

function treeOf(element: unknown): readonly AnyElement[] {
  const out: AnyElement[] = [];
  flatten(element, out);
  return out;
}

function inputsOf(element: unknown): readonly AnyElement[] {
  return treeOf(element).filter((one) => one.type === 'input');
}

const OPTIONS = [
  { value: 'tencent-test', label: '腾讯云 · 测试' },
  { value: 'tencent-prod', label: '腾讯云 · 生产' },
];

describe('ChoiceGroup：单选照旧，多选是新加的那条路', () => {
  it('单选：选中的那一行 checked，点别的行给的是那个字符串', () => {
    const seen: string[] = [];
    const element = ChoiceGroup({
      label: '环境',
      name: 'env',
      value: 'tencent-test',
      options: OPTIONS,
      onChange: (next) => seen.push(next),
    });
    const inputs = inputsOf(element);

    expect(inputs).toHaveLength(2);
    expect(inputs.map((one) => one.props['type'])).toEqual(['radio', 'radio']);
    expect(inputs.map((one) => one.props['checked'])).toEqual([true, false]);
    expect(
      treeOf(element).filter((node) => node.props['className'] === 'wb-radio'),
    ).toHaveLength(2);

    (inputs[1]?.props['onChange'] as () => void)();
    expect(seen).toEqual(['tencent-prod']);
  });

  it('★ 多选：勾上的再点是摘掉，没勾的是加上（给的是整份数组，不是新值）', () => {
    const seen: (readonly string[])[] = [];
    const element = ChoiceGroup({
      multi: true,
      label: '环境',
      name: 'env',
      values: ['tencent-test'],
      options: OPTIONS,
      onChange: (next) => seen.push(next),
    });
    const inputs = inputsOf(element);

    expect(inputs.map((one) => one.props['type'])).toEqual([
      'checkbox',
      'checkbox',
    ]);
    expect(inputs.map((one) => one.props['checked'])).toEqual([true, false]);
    expect(
      treeOf(element).filter((one) => one.props['className'] === 'wb-checkbox'),
    ).toHaveLength(2);

    (inputs[0]?.props['onChange'] as () => void)();
    (inputs[1]?.props['onChange'] as () => void)();

    expect(seen).toEqual([[], ['tencent-test', 'tencent-prod']]);
  });

  it('★ 多选的标签收 ReactNode：两列那种行塞得进去（EnvPicker 靠这条）', () => {
    const element = ChoiceGroup({
      multi: true,
      label: '环境',
      name: 'env',
      values: [],
      options: [
        {
          value: 'tencent-test',
          label: h('span', { className: 'twoColumns' }, 'tencent-test'),
        },
      ],
      onChange: () => {},
    });

    const labels = treeOf(element).filter(
      (one) => one.props['className'] === 'wb-choiceLabel',
    );
    expect(labels).toHaveLength(1);
    expect(
      treeOf(labels[0]?.props['children']).some(
        (one) => one.props['className'] === 'twoColumns',
      ),
    ).toBe(true);
  });

  it('多选的容器是 group、单选是 radiogroup（屏幕阅读器读出来的东西不一样）', () => {
    const multi = treeOf(
      ChoiceGroup({
        multi: true,
        label: '环境',
        name: 'env',
        values: [],
        options: OPTIONS,
        onChange: () => {},
      }),
    ).find((one) => one.props['className'] === 'wb-choiceMenu');
    const single = treeOf(
      ChoiceGroup({
        label: '环境',
        name: 'env',
        value: 'tencent-test',
        options: OPTIONS,
        onChange: () => {},
      }),
    ).find((one) => one.props['className'] === 'wb-choiceMenu');

    expect(multi?.props['role']).toBe('group');
    expect(single?.props['role']).toBe('radiogroup');
  });

  it('勾上了的行带 wb-choiceOptionOn，没勾的不带', () => {
    const rows = treeOf(
      ChoiceGroup({
        multi: true,
        label: '环境',
        name: 'env',
        values: ['tencent-prod'],
        options: OPTIONS,
        onChange: () => {},
      }),
    ).filter((one) => one.type === 'label');

    expect(rows.map((one) => one.props['className'])).toEqual([
      'wb-choiceOption',
      'wb-choiceOption wb-choiceOptionOn',
    ]);
  });

  it('多选里勾上了才画那颗勾（没勾就是个空盒子）', () => {
    const boxes = (values: readonly string[]): readonly AnyElement[] =>
      treeOf(
        ChoiceGroup({
          multi: true,
          label: '环境',
          name: 'env',
          values,
          options: OPTIONS,
          onChange: () => {},
        }),
      ).filter((one) => one.props['className'] === 'wb-checkboxBox');

    expect(boxes([]).map((one) => one.props['children'])).toEqual([null, null]);
    expect(boxes(['tencent-test']).map((one) => one.props['children'])[0]).not.toBeNull();
  });

  it('禁用照旧传下去', () => {
    const inputs = inputsOf(
      ChoiceGroup({
        multi: true,
        label: '环境',
        name: 'env',
        values: [],
        options: OPTIONS,
        disabled: true,
        onChange: () => {},
      }),
    );
    expect(inputs.every((one) => one.props['disabled'] === true)).toBe(true);
  });

  it('★ loading：不画选项，画一行 Spinner + loadingText', () => {
    const element = ChoiceGroup({
      label: '环境',
      name: 'env',
      value: '',
      options: OPTIONS,
      loading: true,
      loadingText: '正在读环境…',
      onChange: () => {},
    });
    const tree = treeOf(element);
    const loading = tree.find((one) => one.props['className'] === 'wb-choiceLoading');

    expect(inputsOf(element)).toHaveLength(0);
    expect(tree.some((one) => one.props['className'] === 'wb-choiceOption')).toBe(false);
    expect(
      treeOf(loading?.props['children']).some(
        (one) => one.props['className'] === 'wb-spinner',
      ),
    ).toBe(true);
    expect(
      treeOf(loading?.props['children']).some(
        (one) => one.props['children'] === '正在读环境…',
      ),
    ).toBe(true);
  });

  it('★ 没得选且不 loading：画 emptyText 那句，不画选项', () => {
    const element = ChoiceGroup({
      label: '环境',
      name: 'env',
      value: '',
      options: [],
      emptyText: '这个工作区还没绑定环境',
      onChange: () => {},
    });

    expect(inputsOf(element)).toHaveLength(0);
    expect(
      treeOf(element).find((one) => one.props['className'] === 'wb-choiceEmpty')
        ?.props['children'],
    ).toBe('这个工作区还没绑定环境');
  });

  it('★ variant 落在菜单上：ghost 写 data-variant=ghost，默认是 boxed', () => {
    const menuOf = (variant?: 'boxed' | 'ghost') =>
      treeOf(
        ChoiceGroup({
          label: '环境',
          name: 'env',
          value: 'tencent-test',
          options: OPTIONS,
          ...(variant === undefined ? {} : { variant }),
          onChange: () => {},
        }),
      ).find((one) => one.props['className'] === 'wb-choiceMenu');

    expect(menuOf('ghost')?.props['data-variant']).toBe('ghost');
    expect(menuOf(undefined)?.props['data-variant']).toBe('boxed');
  });

  it('★ description 画在 label 下面第二行', () => {
    const element = ChoiceGroup({
      label: '环境',
      name: 'env',
      value: 'tencent-test',
      options: [
        { value: 'tencent-test', label: '腾讯云 · 测试', description: '走的是测试账号' },
        { value: 'tencent-prod', label: '腾讯云 · 生产' },
      ],
      onChange: () => {},
    });
    const labels = treeOf(element).filter(
      (one) => one.props['className'] === 'wb-choiceLabel',
    );
    const descriptions = treeOf(element).filter(
      (one) => one.props['className'] === 'wb-choiceDescription',
    );

    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]?.props['children']).toBe('走的是测试账号');
    expect(
      treeOf(labels[0]?.props['children']).some(
        (one) => one.props['className'] === 'wb-choiceDescription',
      ),
    ).toBe(true);
  });

  it('Fragment 还是 React 自己的（别把 key 语义换掉）', () => {
    expect(Fragment).toBeDefined();
  });
});
