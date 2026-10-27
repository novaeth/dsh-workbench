import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import './Rows.css';

/**
 * `Rows` 的契约：一组键值行的容器。
 */
export interface RowsProps {
  readonly children?: ReactNode | undefined;
}

/**
 * 键值行的容器：分隔线、行距与两端对齐在它和 `Row` 里，别自己写 `ul` / `li` 拼。
 * @param props.children - 一串 `Row`。
 * @returns 竖排的 div。
 */
export function Rows({ children }: RowsProps) {
  return <div className="wb-rows">{children}</div>;
}

/**
 * `Row` 的契约：左边名字 + 右边值。
 */
export interface RowProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
}

/**
 * 一行键值：左边名字、右边值；要成对说明一项数据就用它，别自己写两栏。
 * @param props.label - 左边那格（键）。
 * @param props.value - 右边那格（值），可以是数字、时间或一小段节点。
 * @returns 一行两格。
 */
export function Row({ label, value }: RowProps) {
  return (
    <div className="wb-row">
      <span className="wb-rowKey">{label}</span>
      <span className="wb-rowValue">{value}</span>
    </div>
  );
}
