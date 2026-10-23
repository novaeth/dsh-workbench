/**
 * 阻断态取词：i18n 的 `(key) => 文案` 那一半；那几颗钮的「重试中…」等临时说法都从它来。
 */
export type BlockerLabelTranslate = (key: string) => string;

/**
 * 阻断态上一颗钮的形状：`kind` 定行为（`retry` / `copy` 等），`label` 是它平时的文案。
 */
export interface BlockerActionShape {
  readonly kind: string;
  readonly label: string;
  readonly text?: string | undefined;
}

/**
 * 这颗钮此刻的运行态：是否正在重试、哪一支正在跑（按 label 认）、刚复制过哪段文本。
 */
export interface BlockerLabelState {
  readonly retrying: boolean;
  readonly running: string | null;
  readonly copied: string | null;
}
