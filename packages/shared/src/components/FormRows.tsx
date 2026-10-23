import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import './FormRows.css';

/**
 * `FormRows` 的契约：一列 `FormRow` 的容器。
 */
export interface FormRowsProps {
  readonly children?: ReactNode | undefined;
}

/**
 * 表单行的容器：同一份 `FormRows` 共用一个标签列（列宽由最长的标签定），行距也归它。
 * @param props.children - 一串 `FormRow`；非行的孩子（如分组标题）自动通栏。
 * @returns 竖排的 div。
 */
export function FormRows({ children }: FormRowsProps) {
  return <div className="wb-formRows">{children}</div>;
}

/**
 * `FormRow` 的契约：标签、提示、错误与控件的排布。
 */
export interface FormRowProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode | undefined;
  readonly problem?: ReactNode | undefined;
  readonly layout?: 'inline' | 'stacked' | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * 表单一行：左边标签、右边控件，提示与错误占控件下面那一格。
 * @param props.label - 这一行的标签；进了这一行，控件自己就别再给 `label`，否则会多一个标签。
 * @param props.hint - 控件下的说明；给了 `problem` 就不画它 —— 同一格不叠两段话。
 * @param props.problem - 校验失败那句话；给了就顶掉 `hint` 并给整行加上出错标记。
 * @param props.layout - `stacked` 才是标签在上、控件在下（默认 `inline`：标签在左）。
 * @param props.children - 控件本体。
 * @returns 一个 `<label>`。
 */
export function FormRow({ label, hint, problem, layout = 'inline', children }: FormRowProps) {
  return (
    <label
      className="wb-formRow"
      data-layout={layout}
      data-wb-problem={problem === undefined ? undefined : ''}
    >
      <span className="wb-formLabel">{label}</span>
      <span className="wb-formControl">{children}</span>
      {problem === undefined ? (
        hint === undefined ? null : (
          <span className="wb-formHint">{hint}</span>
        )
      ) : (
        <span className="wb-formProblem">{problem}</span>
      )}
    </label>
  );
}
