/**
 * 从 react 借来的三个类型（`ReactNode` / `CSSProperties` / `ChangeEvent`）—— 模块从这里拿，
 * 就不必自己直接依赖 react。只取类型：编译期擦除，不进任何产物。
 */
export type { ReactNode, CSSProperties, ChangeEvent } from 'react';
