import type { ReactNode } from '../lib/react.js';
import type { FormAction } from './FormActions.js';

/**
 * 默认档一格控件的值：单值（`TextField` / `SelectField` / `ChoiceGroup` 单选），或一组值（`ChoiceGroup` 多选）。
 * 写了 `Form<Values>` 的类型参数之后，每一格的值类型由 `Values[那一格的键]` 定 —— 这个联合只是**没写类型参数**时的默认档。
 */
export type FormValue = string | readonly string[];

/**
 * 默认档的 `Values`：键是任意 `string`、值是 `FormValue` —— 不写 `Form<Values>` 的类型参数时就是它，
 * 于是 `fields` 的键与值都不钉（老写法照旧能编），代价是每格拿到的都是那个联合、要自己收窄。
 */
export type FormValues = Readonly<Record<string, FormValue>>;

/**
 * `Form` 递给控件那一格的绑定：`id` / `name` / `invalid` / `disabled` 由 `Form` 定；
 * `value` / `onChange` 就是这一格自己那份配置里的那两个**原样转手**（`Form` 不持有值）——
 * 控件接上即可，别再自己接 model：值只写在字段配置里那一次。
 */
export interface FormFieldBinding<K extends string = string, V = FormValue> {
  readonly id: string;
  readonly name: K;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly value: V;
  readonly onChange: (next: V) => void;
}

/**
 * 一格字段的配置：键、标签、值、值怎么改（`onChange`）、怎么算错（`validate`）、控件本身 ——
 * 排布、时机、阻断都不写在这里，那些归 `Form`。`value` 与 `onChange` 就在同一格里，`control` 从绑定直接取
 * （`(binding) => …（{ value: binding.value, onChange: binding.onChange }）`），值不再有第二处。
 * `validate` 是纯函数、同步、只读 `values`：返回**真值**才算这一格错，假值（`undefined` / `null` / `false` / 空串）
 * 一律当"没错"—— 所以 `(value) => value.trim() === '' && '必填'` 这种用 `&&` 算文案的写法是对的，
 * 它的返回值就是错误行那句话。
 */
export interface FormField<
  K extends string = string,
  V = FormValue,
  Vals extends object = FormValues,
> {
  readonly key: K;
  readonly label: ReactNode;
  readonly hint?: ReactNode | undefined;
  readonly layout?: 'inline' | 'stacked' | undefined;
  readonly value: V;
  readonly onChange: (next: V) => void;
  readonly visible?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly validate?: (value: V, values: Readonly<Vals>) => ReactNode | undefined;
  readonly control: (binding: FormFieldBinding<K, V>) => ReactNode;
}

/**
 * 把 `Values` 的每一键映射成一格字段 —— 写 `Form<Values>` 时 `fields` 就是这个联合的数组：
 * `{ key: 'env', … }` 那一格的 `value` / `onChange` / `validate` 只认 `Values['env']`，
 * `control` 拿到的绑定也只带它。要"键值都不钉"的松档就干脆别写类型参数（默认档 `FormValues`），别手写这个类型。
 */
export type FormFieldOf<Values extends object> = {
  [K in keyof Values & string]: FormField<K, Values[K], Values>;
}[keyof Values & string];

/**
 * 提交钮：文案归调用点，位置、禁用与忙态归 `Form`。
 */
export interface FormSubmit {
  readonly label: ReactNode;
  readonly busyLabel?: ReactNode | undefined;
}

/**
 * 取消钮：文案与点下去做什么，`Form` 把它排在提交钮左边。
 */
export interface FormCancel {
  readonly label: ReactNode;
  readonly onClick: () => void;
}

/**
 * `Form` 的契约：`fields` 配置进，排布、校验时机、提交阻断、操作区全归组件。
 * `Values` 是**那张值表**的形状（不写就是默认档 `FormValues`）：`fields` 的键只能取它的键，
 * 每格的 `value` / `onChange` / `validate` 只认它那一键的值类型，`onSubmit` 与 `validate` 第二参收到的也是它。
 * **会 `visible: false` 的键写成可选键**（`branch?: string`）—— 那一格不渲染、不校验、不进 `values`（规则五），
 * 可选键让"它可能不在表里"这件事在类型上也成立；永远可见的键照常必填。
 */
export interface FormProps<Values extends object = FormValues> {
  readonly fields: readonly FormFieldOf<Values>[];
  readonly onSubmit: (values: Readonly<Values>) => void;
  readonly submit: FormSubmit;
  readonly cancel?: FormCancel | undefined;
  readonly extra?: readonly FormAction[] | undefined;
  readonly busy?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly problem?: ReactNode | undefined;
}
