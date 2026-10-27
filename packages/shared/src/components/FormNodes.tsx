import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import type { FormAction } from './FormActions.js';
import type { FormField, FormFieldOf, FormValues } from './FormTypes.js';
import { FormRow } from './FormRows.js';

/**
 * 只剩要显示的那些格子 —— `visible: false` 的当它不存在：不渲染、不校验、不进 `values`，也不参与找第一处错误。
 * @param fields - 表单的字段清单。
 * @returns 保序的新数组，`visible` 不给或为 `true` 的都在；全不可见时给空数组。
 */
export function visibleFieldsOf<Values extends object>(
  fields: readonly FormFieldOf<Values>[],
): readonly FormFieldOf<Values>[] {
  return fields.filter((field) => field.visible !== false);
}

/**
 * 找出装配错的键：**假值**的键（空串 / `undefined` / `null`，运行期真漏给 `key` 就是这条）每次出现都算一处，
 * 以及同一张表单里出现两次的键 —— 这两样都会让 `id` 撞车、`values` 少一格。
 * @param fields - 表单的字段清单（通常是已经过滤过可见性的那份）。
 * @returns 出问题的键的清单、按首次出现顺序去重；缺失的键一律记成空串（报的时候印成 `（空 key）`），空表给空数组。
 */
export function duplicateKeysOf(fields: readonly { readonly key: string }[]): readonly string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const field of fields) {
    const key = field.key;
    if (!key) {
      duplicated.add('');
      continue;
    }
    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  }
  return [...duplicated];
}

/**
 * 装配错了要当场诊断：`key` 缺失或重复时给 `console.error` —— 但照渲不误，不 throw。
 * 形式与理由同 `FormActions` 里那颗多出来的 `primary`：装配的小错不该让 `CardBoundary` 把用户的整张卡变空白。
 * @param fields - 表单的字段清单（通常是已经过滤过可见性的那份）。
 */
export function reportDuplicateKeys(fields: readonly { readonly key: string }[]): void {
  const duplicated = duplicateKeysOf(fields);
  if (duplicated.length === 0) return;
  const named = duplicated.map((key) => (key === '' ? '（空 key）' : key));
  console.error(
    `[dsh-workbench] Form 里有重复或缺失的字段 key：${named.join('、')} —— ` +
      '同一张表单里 key 必须唯一且非空（它决定 id 与 values 的键），否则 id 会撞车、values 会少一格',
  );
}

/**
 * 把每格的 `value` 收成一张键值表交给 `onSubmit` —— `Form` 自己一个值都不存，这张表就是从 `fields` 现取的快照。
 * @param fields - 表单的字段清单；取的就是它们的 `value`，`value` 是数组的那格（多选）原样带出、不复制。
 * @returns 键为字段 `key`、值为该格 `value` 的表；`fields` 为空时给空表，不是 `undefined`。
 */
export function formValuesOf<Values extends object>(
  fields: readonly FormFieldOf<Values>[],
): Readonly<Values> {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field.key] = field.value;
  return values as Readonly<Values>;
}

/**
 * 算每格现在该不该报错：还没提交过（`show` 为 false）时一格都不报 —— 不边打字边骂人。
 * `validate` 返回**真值**才算错，假值（`undefined` / `null` / `false` / 空串）一律当"这格没错" ——
 * 所以 `v.trim() === '' && '必填'` 这种用 `&&` 算文案的写法是对的。
 * @param fields - 表单的字段清单（通常是已经过滤过可见性的那份）。
 * @param show - 提交过没有；false 时全给 `undefined`，true 时逐格调 `field.validate` 并按真值收。
 * @returns 键为 `key`、值为那句文案或 `undefined` 的表；没给 `validate` 的格子也是 `undefined`。
 */
export function formProblemsOf<Values extends object>(
  fields: readonly FormFieldOf<Values>[],
  show: boolean,
): Readonly<Record<string, ReactNode | undefined>> {
  const values = formValuesOf(fields);
  const problems: Record<string, ReactNode | undefined> = {};
  for (const field of fields) {
    const found = show ? problemOf(field, values) : undefined;
    problems[field.key] = found ? found : undefined;
  }
  return problems;
}

function problemOf<K extends string, V, Vals extends object>(
  field: FormField<K, V, Vals>,
  values: Readonly<Vals>,
): ReactNode | undefined {
  return field.validate?.(field.value, values);
}

/**
 * 按字段顺序取第一处错误 —— 提交被挡住时要带进视口的就是这一格。
 * 判的是**真值**（与 `formProblemsOf` 同一口径）：假值那种"错误文案"渲染出来本来就是空的，不算错。
 * @param fields - 表单的字段清单，顺序就是「第一处」的判据。
 * @param problems - `formProblemsOf` 那张表，也可以是调用点自己拼的（同样按真值判）。
 * @returns 第一格有错的字段；一格都没错时给 `undefined`。
 */
export function formFirstProblemOf<Values extends object>(
  fields: readonly FormFieldOf<Values>[],
  problems: Readonly<Record<string, ReactNode | undefined>>,
): FormFieldOf<Values> | undefined {
  return fields.find((field) => Boolean(problems[field.key]));
}

/**
 * 提交那一拍的结果：有错就挡住（并点出第一处错在哪一格），没错就把键值表交出去。
 */
export type FormSubmitOutcome<Values extends object = FormValues> =
  | { readonly blocked: true; readonly first: FormFieldOf<Values> }
  | { readonly blocked: false; readonly values: Readonly<Values> };

/**
 * 算提交那一拍该干什么 —— `Form` 的提交钮点下去、以及 `<form>` 的 Enter 提交，走的都是它。
 * 错的判据只有一份（`formProblemsOf` + `formFirstProblemOf`），这里不重算第二遍。
 * @param fields - 要提交的那些格子（通常是调用点先 `visibleFieldsOf` 过滤过的，不可见那格不进 `values` 也不算错）。
 * @returns `blocked: true` 时带上是按字段顺序数第一格有错的字段（拿它去 `revealFirstProblem`）；
 * `blocked: false` 时带上从 `fields` 现取的键值表。空表一定给 `blocked: false` 与空 values。
 */
export function formSubmitOf<Values extends object>(
  fields: readonly FormFieldOf<Values>[],
): FormSubmitOutcome<Values> {
  const problems = formProblemsOf(fields, true);
  const first = formFirstProblemOf(fields, problems);
  if (first !== undefined) return { blocked: true, first };
  return { blocked: false, values: formValuesOf(fields) };
}

/**
 * 组表单的操作区：调用点给的其余动作在最左，取消在中间，提交永远是最右那颗 `primary`。
 * @param args.extra - 其余动作（default / danger），保持调用点给的顺序；不给就是没有。
 * @param args.cancel - 取消那格的 `label` 与 `onClick`；不给就少一颗钮。
 * @param args.submit - 提交钮的 `label` 与 `busyLabel`。
 * @param args.busy - 提交中：提交钮带转圈并换 `busyLabel`（不给就沿用 `label`），`extra` 与取消一起禁用。
 * @param args.disabled - 只再禁提交钮（如没改动可存），其余动作不受影响。
 * @param args.onSubmitClick - 提交钮点下去做什么，通常是把这一拍交给 `Form` 的提交处理。
 * @returns 给 `FormActions` 的动作清单；没给 `extra` 也没给 `cancel` 时只剩提交那一颗。
 */
export function formActionsOf(args: {
  readonly extra: readonly FormAction[] | undefined;
  readonly cancel: { readonly label: ReactNode; readonly onClick: () => void } | undefined;
  readonly submit: { readonly label: ReactNode; readonly busyLabel?: ReactNode | undefined };
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onSubmitClick: () => void;
}): readonly FormAction[] {
  const submit: FormAction = {
    key: 'submit',
    label: args.busy ? (args.submit.busyLabel ?? args.submit.label) : args.submit.label,
    kind: 'primary',
    busy: args.busy,
    disabled: args.busy || args.disabled,
    onClick: args.onSubmitClick,
  };
  const cancel: readonly FormAction[] =
    args.cancel === undefined
      ? []
      : [
          {
            key: 'cancel',
            label: args.cancel.label,
            kind: 'default',
            disabled: args.busy,
            onClick: args.cancel.onClick,
          },
        ];
  const extra = (args.extra ?? []).map(
    (action): FormAction => (args.busy ? { ...action, disabled: true } : action),
  );
  return [...extra, ...cancel, submit];
}

/**
 * 把整张表单的行画出来 —— 每格一个 `FormRow`，且**直接**是 `FormRows` 的孩子。
 * 中间不许再包一层：`FormRow` 一旦不是 `.wb-formRows` 的网格项，`FormRows.css` 里那条 `subgrid` 就不匹配，
 * 每行各自算列宽，控件左沿就参差了。
 * @param args.fields - 要画的格子（通常是已经过滤过可见性的那份），顺序就是行的顺序。
 * @param args.problems - `formProblemsOf` 那张表，决定哪一格显示错误文案（按**真值**判，假值不当错）。
 * @param args.showProblem - 这一拍该不该显示错误（还没提交过时为 false，一格都不显示）。
 * @param args.busy - 提交中：每格的绑定 `disabled` 为真。
 * @returns `FormRow` 组成的数组；没有可画的格子时给空数组。
 */
export function formRowsOf<Values extends object>(args: {
  readonly fields: readonly FormFieldOf<Values>[];
  readonly problems: Readonly<Record<string, ReactNode | undefined>>;
  readonly showProblem: boolean;
  readonly busy: boolean;
}): readonly ReactNode[] {
  return args.fields.map((field) =>
    h(FormRow, {
      key: field.key,
      label: field.label,
      htmlFor: controlIdOf(field.key),
      hint: field.hint,
      problem: args.showProblem ? args.problems[field.key] : undefined,
      layout: field.layout,
    }, controlOf(field, args.problems, args.showProblem, args.busy)),
  );
}

function controlIdOf(key: string): string {
  return `wb-form-${key}`;
}

function controlOf<K extends string, V, Vals extends object>(
  field: FormField<K, V, Vals>,
  problems: Readonly<Record<string, ReactNode | undefined>>,
  showProblem: boolean,
  busy: boolean,
): ReactNode {
  return field.control({
    id: controlIdOf(field.key),
    name: field.key,
    invalid: showProblem && Boolean(problems[field.key]),
    disabled: busy || field.disabled === true,
    value: field.value,
    onChange: field.onChange,
  });
}
