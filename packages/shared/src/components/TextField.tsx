import type { InputHTMLAttributes } from 'react';
import './TextField.css';
import { h } from '../lib/react.js';

/**
 * `TextField` 的契约：原生 input 属性，外加一个标红开关。
 */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

/**
 * 单行文本输入：设置面与筛选框都用它，`invalid` 之外的属性全部透传给原生 `<input>`。
 * @param props.invalid - 置真标红并写 `aria-invalid`（默认 false）；错在哪一句归 `FormRow.problem`。
 * @returns 输入框元素；`className` 是追加在基础类名之后，而不是替换它。
 */
export function TextField({ invalid = false, className, ...rest }: TextFieldProps) {
  return (
    <input
      {...rest}
      className={className === undefined ? 'wb-textField' : `wb-textField ${className}`}
      aria-invalid={invalid || undefined}
    />
  );
}
