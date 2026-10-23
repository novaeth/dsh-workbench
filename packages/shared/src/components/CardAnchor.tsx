import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import styles from './CardAnchor.module.css';

/**
 * 由 unit id 拼出卡片锚点 id，外壳的截图、滚动与页面探针都按它找卡。
 * @param unit - unit id；`null` 或空串（没有 unit 的卡）时返回 undefined，不生成锚点。
 * @returns `wb-card-<unit>`，或 undefined。
 */
export function cardIdOf(unit: string | null): string | undefined {
  return unit === null || unit === '' ? undefined : `wb-card-${unit}`;
}

/**
 * `CardAnchor` 的契约：unit id 与它锚住的内容。
 */
export interface CardAnchorProps {
  readonly unit: string;
  readonly children?: ReactNode | undefined;
}

/**
 * 外壳自己盖的卡片锚点：套在卡外面给出 `id="wb-card-<unit>"`；模块别自己写，也别删。
 * @param props.unit - 卡的 unit id，用来算锚点 id。
 * @param props.children - 被锚住的卡片本体；锚点自己 `display: contents`，不占布局。
 * @returns 带 id 的占位 div。
 */
export function CardAnchor({ unit, children }: CardAnchorProps) {
  return (
    <div id={cardIdOf(unit)} className={styles.anchor}>
      {children}
    </div>
  );
}
