import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FormField, FormValue } from './FormTypes.js';
import {
  duplicateKeysOf,
  formActionsOf,
  formFirstProblemOf,
  formProblemsOf,
  formRowsOf,
  formSubmitOf,
  formValuesOf,
  reportDuplicateKeys,
  visibleFieldsOf,
} from './FormNodes.js';
import { FormRow } from './FormRows.js';
import type { FormAction } from './FormActions.js';

function field(key: string, value: FormValue, validate?: FormField['validate']): FormField {
  return {
    key,
    label: key,
    value,
    onChange: () => {},
    control: (binding) => `${key}:${binding.id}:${String(binding.invalid)}:${String(binding.disabled)}`,
    ...(validate === undefined ? {} : { validate }),
  };
}

function propsOf(node: unknown): Record<string, unknown> {
  return (node as { props: Record<string, unknown> }).props;
}

function typeOf(node: unknown): unknown {
  return (node as { type: unknown }).type;
}

function keyOf(node: unknown): unknown {
  return (node as { key: unknown }).key;
}

describe('visibleFieldsOf', () => {
  it('★ visible: false 的那格当它不存在（不渲染、不校验、不进 values）', () => {
    const fields = [field('env', 'prod'), { ...field('secret', 'x'), visible: false }, field('app', 'a')];

    expect(visibleFieldsOf(fields).map((one) => one.key)).toEqual(['env', 'app']);
    expect(formValuesOf(visibleFieldsOf(fields))).toEqual({ env: 'prod', app: 'a' });
  });

  it('visible 不给或给 true 都留在表里；顺序不变', () => {
    const fields = [field('a', '1'), { ...field('b', '2'), visible: true }, { ...field('c', '3'), visible: true }];

    expect(visibleFieldsOf(fields).map((one) => one.key)).toEqual(['a', 'b', 'c']);
  });

  it('全不可见时给空数组（当提交时的表就是空的）', () => {
    expect(visibleFieldsOf([{ ...field('a', '1'), visible: false }])).toEqual([]);
  });
});

describe('duplicateKeysOf / reportDuplicateKeys', () => {
  it('★ 重复的键只报一次、按首次出现顺序；没有重复给空数组', () => {
    expect(duplicateKeysOf([field('a', ''), field('a', ''), field('a', ''), field('b', '')])).toEqual(['a']);
    expect(duplicateKeysOf([field('a', ''), field('b', '')])).toEqual([]);
    expect(duplicateKeysOf([])).toEqual([]);
  });

  it('★ 空 key 也算装配错（它会让 id 撞成同一个）', () => {
    expect(duplicateKeysOf([field('', '')])).toEqual(['']);
    expect(duplicateKeysOf([field('', ''), field('a', '')])).toEqual(['']);
  });

  it('★ 运行期真漏给 key（undefined / null）也算一处，名字印成（空 key）', () => {
    const missing = { ...field('gone', ''), key: undefined } as unknown as FormField;
    const alsoMissing = { ...field('gone2', ''), key: null } as unknown as FormField;

    expect(duplicateKeysOf([missing])).toEqual(['']);
    expect(duplicateKeysOf([alsoMissing])).toEqual(['']);
    expect(duplicateKeysOf([missing, alsoMissing])).toEqual(['']);

    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void calls.push(args);
    try {
      reportDuplicateKeys([missing]);
    } finally {
      console.error = original;
    }

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.[0])).toContain('（空 key）');
  });

  it('★ 装配错了只给 console.error，不 throw（照 FormActions 多一颗 primary 的形式）', () => {
    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void calls.push(args);
    try {
      expect(() => reportDuplicateKeys([field('a', ''), field('a', '')])).not.toThrow();
    } finally {
      console.error = original;
    }

    expect(calls).toHaveLength(1);
    const message = String(calls[0]?.[0]);
    expect(message).toContain('[dsh-workbench]');
    expect(message).toContain('a');
  });

  it('装配没错就一声不响', () => {
    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void calls.push(args);
    try {
      reportDuplicateKeys([field('a', ''), field('b', '')]);
    } finally {
      console.error = original;
    }

    expect(calls).toHaveLength(0);
  });
});

describe('formValuesOf', () => {
  it('★ 每格的 key 与 value 落成一张表（顺序就是字段顺序）', () => {
    const values = formValuesOf([field('env', 'prod'), field('app', 'uedyhsj')]);

    expect(values).toEqual({ env: 'prod', app: 'uedyhsj' });
    expect(Object.keys(values)).toEqual(['env', 'app']);
  });

  it('★ 多选那份（一组值）原样带出，不被摊平、不被复制', () => {
    const chosen = ['prod', 'staging'] as const;

    expect(formValuesOf([field('envs', chosen)])['envs']).toBe(chosen);
  });

  it('空表单给空表（不是 undefined）', () => {
    expect(formValuesOf([])).toEqual({});
  });

  it('同键后写覆盖前写（表单里键本就该唯一，重复由 reportDuplicateKeys 报出来）', () => {
    expect(formValuesOf([field('env', 'a'), field('env', 'b')])).toEqual({ env: 'b' });
  });
});

describe('formProblemsOf', () => {
  const fields = [
    field('project', '', () => '这个项目不存在'),
    field('env', 'prod', () => undefined),
    field('note', 'x', (value) => (value === 'x' ? '备注不能是 x' : undefined)),
  ];

  it('★ 还没提交过：一格错都不显示（不边打字边骂人）', () => {
    expect(formProblemsOf(fields, false)).toEqual({ project: undefined, env: undefined, note: undefined });
  });

  it('★ 提交过：逐格重算，有错的给那句文案、没错的给 undefined', () => {
    const problems = formProblemsOf(fields, true);

    expect(problems['project']).toBe('这个项目不存在');
    expect(problems['env']).toBeUndefined();
    expect(problems['note']).toBe('备注不能是 x');
  });

  it('没给 validate 的格子永远是 undefined（两层态都不报）', () => {
    const plain = [field('env', 'prod')];

    expect(formProblemsOf(plain, true)['env']).toBeUndefined();
    expect(formProblemsOf(plain, false)['env']).toBeUndefined();
  });

  it('★ 假值都算没错：undefined / null / false / 空串四种一格都不挡', () => {
    const falsy = [undefined, null, false, ''] as const;
    const fields = falsy.map((value, index) => field(`f${String(index)}`, 'x', () => value));

    const problems = formProblemsOf(fields, true);

    for (const one of fields) expect(problems[one.key]).toBeUndefined();
    expect(formFirstProblemOf(fields, problems)).toBeUndefined();
  });

  it('★ 真值才算错（`&&` 那种最顺手的写法是对的）', () => {
    const required: FormField['validate'] = (value) =>
      typeof value === 'string' && value.trim() === '' && '必填';
    const empty = field('project', '', required);
    const filled = field('note', 'ok', required);

    expect(formProblemsOf([empty, filled], true)).toEqual({ project: '必填', note: undefined });
    expect(formFirstProblemOf([empty, filled], formProblemsOf([empty, filled], true))?.key).toBe('project');
  });

  it('validate 读得到整张表（第二格能看见第一格的值）', () => {
    const cross = [
      field('a', '1'),
      field('b', '2', (_value, values) => (values['a'] === '1' ? 'a 是 1 就不行' : undefined)),
    ];

    expect(formProblemsOf(cross, true)['b']).toBe('a 是 1 就不行');
  });

  it('★ 不可见那格不跑 validate：两条互证 —— 未过滤会被调，过滤后不被调', () => {
    const calls: string[] = [];
    const hidden: FormField = {
      ...field('secret', 'x', () => {
        calls.push('secret');
        return '永远不该被算';
      }),
      visible: false,
    };
    const fields = [field('env', 'prod'), hidden];

    formProblemsOf(fields, true);
    expect(calls).toEqual(['secret']);

    calls.length = 0;
    const problems = formProblemsOf(visibleFieldsOf(fields), true);

    expect(calls).toEqual([]);
    expect(problems).toEqual({ env: undefined });
  });
});

describe('formFirstProblemOf', () => {
  it('★ 按字段顺序取第一处（不是按表里的键序）', () => {
    const fields = [field('a', ''), field('b', ''), field('c', '')];
    const problems = { c: 'c 错', b: 'b 错', a: 'a 错' };

    expect(formFirstProblemOf(fields, problems)?.key).toBe('a');
  });

  it('★ 一格都没错给 undefined（那一拍不滚、不抢焦点）', () => {
    expect(formFirstProblemOf([field('a', 'ok')], { a: undefined })).toBeUndefined();
    expect(formFirstProblemOf([], {})).toBeUndefined();
  });
});

describe('formSubmitOf', () => {
  it('★ 全过 ⇒ blocked: false，交出来的键就是那几个（值现取）', () => {
    const outcome = formSubmitOf([field('env', 'prod'), field('app', 'uedyhsj')]);

    expect(outcome.blocked).toBe(false);
    expect(outcome.blocked ? {} : outcome.values).toEqual({ env: 'prod', app: 'uedyhsj' });
  });

  it('★ 任一格有错 ⇒ blocked: true，first 是按字段顺序的第一格（不是随便一格）', () => {
    const fields = [
      field('a', '', () => undefined),
      field('b', '', () => 'b 错了'),
      field('c', '', () => 'c 也错了'),
    ];
    const outcome = formSubmitOf(fields);

    expect(outcome.blocked).toBe(true);
    expect(outcome.blocked ? outcome.first.key : undefined).toBe('b');
    expect(outcome.blocked ? 'values' in outcome : true).toBe(false);
  });

  it('★ 第一格就错时 first 是它（顺序判据两头都咬得住）', () => {
    const fields = [field('a', '', () => 'a 错了'), field('b', '', () => 'b 也错了')];
    const outcome = formSubmitOf(fields);

    expect(outcome.blocked ? outcome.first.key : undefined).toBe('a');
  });

  it('★ validate 看到的是整张 values（跨字段那种校验做得了）', () => {
    const bothFilled: FormField['validate'] = (_value, values) =>
      values['a'] !== '' && values['b'] !== '' ? '两个不能同时填' : undefined;
    const fields = [field('a', 'x'), field('b', 'y', bothFilled)];
    const outcome = formSubmitOf(fields);

    expect(outcome.blocked).toBe(true);
    expect(outcome.blocked ? outcome.first.key : undefined).toBe('b');
  });

  it('★ 没给 validate 的格子一律不算错（哪怕值是空串）', () => {
    const outcome = formSubmitOf([field('a', ''), field('b', ['x'])]);

    expect(outcome.blocked).toBe(false);
    expect(outcome.blocked ? {} : outcome.values).toEqual({ a: '', b: ['x'] });
  });

  it('空表 ⇒ blocked: false 与空 values（一张没有字段的表没有可挡的）', () => {
    const outcome = formSubmitOf([]);

    expect(outcome.blocked).toBe(false);
    expect(outcome.blocked ? {} : outcome.values).toEqual({});
  });

  it('★ 只算给进来的那些格子（不可见那格由调用点先过滤掉，这里看不到它）', () => {
    const fields = [field('env', 'prod'), { ...field('secret', 'x', () => '永远不该被算'), visible: false }];
    const outcome = formSubmitOf(visibleFieldsOf(fields));

    expect(outcome.blocked).toBe(false);
    expect(outcome.blocked ? {} : outcome.values).toEqual({ env: 'prod' });
  });
});

describe('formActionsOf', () => {
  const submit = { label: '保存', busyLabel: '保存中…' };
  const cancel = { label: '取消', onClick: () => {} };

  function base(over: Partial<Parameters<typeof formActionsOf>[0]> = {}) {
    return formActionsOf({
      extra: undefined,
      cancel: undefined,
      submit,
      busy: false,
      disabled: false,
      onSubmitClick: () => {},
      ...over,
    });
  }

  it('★ 顺序：extra → cancel → submit(primary)，提交那颗永远在最右', () => {
    const actions = base({
      extra: [
        { key: 'retry', label: '重试', onClick: () => {} },
        { key: 'remove', label: '清除', kind: 'danger', onClick: () => {} },
      ],
      cancel,
    });

    expect(actions.map((one) => [one.key, one.kind])).toEqual([
      ['retry', undefined],
      ['remove', 'danger'],
      ['cancel', 'default'],
      ['submit', 'primary'],
    ]);
  });

  it('没给 extra 也没给 cancel 时只剩提交那一颗（且仍是 primary）', () => {
    expect(base().map((one) => [one.key, one.kind])).toEqual([['submit', 'primary']]);
  });

  it('★ busy：提交钮换 busyLabel、带 busy、禁用；cancel 与 extra 一起禁用', () => {
    const extra: readonly FormAction[] = [{ key: 'retry', label: '重试', onClick: () => {} }];
    const [retry, cancelAction, submitAction] = base({ extra, cancel, busy: true });

    expect(submitAction?.label).toBe('保存中…');
    expect(submitAction?.busy).toBe(true);
    expect(submitAction?.disabled).toBe(true);
    expect(cancelAction?.disabled).toBe(true);
    expect(retry?.disabled).toBe(true);
  });

  it('★ busy 不给 busyLabel 时沿用 label', () => {
    const actions = base({ submit: { label: '保存' }, busy: true });

    expect(actions[0]?.label).toBe('保存');
  });

  it('★ disabled 只禁提交钮，其余动作不受影响', () => {
    const actions = base({ extra: [{ key: 'retry', label: '重试', onClick: () => {} }], cancel, disabled: true });

    expect(actions.find((one) => one.key === 'submit')?.disabled).toBe(true);
    expect(actions.find((one) => one.key === 'cancel')?.disabled).toBe(false);
    expect(actions.find((one) => one.key === 'retry')?.disabled).toBeUndefined();
  });

  it('提交钮的 onClick 就是给进来的那一拍（顺序不在调用点手里，动作的后果在）', () => {
    let clicked = 0;
    const actions = base({ onSubmitClick: () => (clicked += 1) });

    actions[0]?.onClick();
    expect(clicked).toBe(1);
  });
});

describe('formRowsOf', () => {
  const problems = { env: '选一个环境' };

  it('★ 每格直接就是一颗 FormRow（中间不许包 div，否则 subgrid 不匹配、控件左沿参差）', () => {
    const rows = formRowsOf({ fields: [field('env', 'prod'), field('app', 'a')], problems, showProblem: true, busy: false });

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(typeOf(row)).toBe(FormRow);
      expect(propsOf(row)['className']).toBeUndefined();
    }
  });

  it('★ key 挂在 FormRow 自己身上（React 的列表键在这一层）', () => {
    const rows = formRowsOf({ fields: [field('env', 'prod')], problems, showProblem: true, busy: false });

    expect(keyOf(rows[0])).toBe('env');
  });

  it('★ problem 透传给 FormRow：有错那格显示文案并挂 data-wb-problem，没错那格没有', () => {
    const rows = formRowsOf({
      fields: [field('env', 'prod'), field('app', 'a')],
      problems,
      showProblem: true,
      busy: false,
    });

    expect(propsOf(rows[0])['problem']).toBe('选一个环境');
    expect(propsOf(rows[1])['problem']).toBeUndefined();
  });

  it('★ 控件那格拿到的绑定：invalid 只在这次该显示错时为真', () => {
    const rows = formRowsOf({ fields: [field('env', 'prod')], problems, showProblem: true, busy: false });

    expect(propsOf(rows[0])['children']).toBe('env:wb-form-env:true:false');
  });

  it('★ 这一格的 value / onChange 从字段配置原样进绑定（值只写一处）', () => {
    const onChange = (): void => {};
    const probe: FormField = {
      key: 'env',
      label: 'env',
      value: 'prod',
      onChange,
      control: (binding) => `${String(binding.value)}:${String(binding.onChange === onChange)}`,
    };
    const rows = formRowsOf({ fields: [probe], problems: {}, showProblem: false, busy: false });

    expect(propsOf(rows[0])['children']).toBe('prod:true');
  });

  it('★ 还没提交过（showProblem: false）：文案不画、invalid 也不给（done 之前一律 false）', () => {
    const rows = formRowsOf({ fields: [field('env', 'prod')], problems, showProblem: false, busy: false });

    expect(propsOf(rows[0])['problem']).toBeUndefined();
    expect(propsOf(rows[0])['children']).toBe('env:wb-form-env:false:false');
  });

  it('★ busy 让每格的绑定 disabled 为真；layout 与 hint 原样透传', () => {
    const withHint: FormField = { ...field('env', 'prod'), hint: '只列非生产', layout: 'stacked' };
    const rows = formRowsOf({ fields: [withHint], problems: {}, showProblem: false, busy: true });

    expect(propsOf(rows[0])['children']).toBe('env:wb-form-env:false:true');
    expect(propsOf(rows[0])['hint']).toBe('只列非生产');
    expect(propsOf(rows[0])['layout']).toBe('stacked');
  });

  it('没有可画的格子时给空数组', () => {
    expect(formRowsOf({ fields: [], problems: {}, showProblem: false, busy: false })).toEqual([]);
  });
});

const CSS = readFileSync(new URL('./Form.css', import.meta.url), 'utf8');

function declarations(selector: string): string[] {
  for (const block of CSS.split('}')) {
    const [head, ...rest] = block.split('{');
    if (rest.length === 0 || head === undefined) continue;
    if (head.trim() !== selector) continue;
    return rest
      .join('{')
      .split(';')
      .map((one) => one.replace(/\s+/g, ' ').trim())
      .filter((one) => one !== '');
  }
  throw new Error(`Form.css 里没有这条规则：${selector}`);
}

describe('整张表单的版式（spec §2.2 规则三）', () => {
  it('★ `.wb-form` 是那个纵向栈：flex / column / 唯一一档间距', () => {
    const rule = declarations('.wb-form');

    expect(rule).toContain('display: flex');
    expect(rule).toContain('flex-direction: column');
    expect(rule).toContain('gap: var(--wb-len-12)');
    expect(rule.filter((one) => one.startsWith('gap:'))).toHaveLength(1);
  });

  it('★ `.wb-form` 占满自己那一格（width: 100%），操作区才贴得到右沿', () => {
    expect(declarations('.wb-form')).toContain('width: 100%');
  });

  it('★ 位置靠结构不靠扳：`Form.css` 里不许出现 `.wb-formActions`，也不许有宽度 / 外边距去扳它', () => {
    expect(CSS).not.toMatch(/\.wb-formActions\b/);
    expect(CSS).not.toMatch(/justify-content|margin/);
  });

  it('★ 表单级那句错不自己开类名：`.wb-formProblem` 归 FormRows，这里一个都不留', () => {
    expect(CSS).not.toMatch(/\.wb-formProblem\b/);
  });

  it('★ 认的是类名，不是 `data-wb-*` 属性选择器（那个命名空间归模块）', () => {
    expect(CSS).not.toMatch(/\[data-wb-/);
  });

  it('★ 颜色 / 字号 / 长度只走令牌，不写字面值（`width: 100%` 是占比，不是尺寸字面值）', () => {
    const values = CSS.match(/(?:color|font-size|line-height|gap|padding|margin)\s*:\s*([^;]+);/g) ?? [];

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toMatch(/var\(--(?:dsw|wb)-/);
  });
});
