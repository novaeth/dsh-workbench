import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import './Stack.css';

/**
 * `Stack` 的契约：只带一个竖排内容槽。
 */
export interface StackProps {
  readonly children?: ReactNode | undefined;
}

/**
 * 竖排容器：把相邻内容按统一间距摞起来，懒得自己分组时的默认外包装。
 * @param props.children - 要竖排的内容；不给就渲染一个空容器。
 * @returns 竖排的 div。
 */
export function Stack({ children }: StackProps) {
  return <div className="wb-stack">{children}</div>;
}
