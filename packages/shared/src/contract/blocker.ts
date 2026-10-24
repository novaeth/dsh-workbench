/**
 * 卡住时用户能点的那一下（开链接 / 复制命令 / 重试 / 装或升模块）：由判据产出，卡片照原样渲染。
 */
export type BlockerAction =
  | {
      readonly kind: 'open-url';
      readonly label: string;
      readonly url: string;
      readonly inline?: boolean;
    }
  | { readonly kind: 'copy'; readonly label: string; readonly text: string }
  | { readonly kind: 'retry'; readonly label: string }
  | {
      readonly kind: 'run-fix';
      readonly label: string;
      readonly unit: string;
      readonly fix: 'install' | 'update';
    }
  | { readonly kind: 'open-market'; readonly label: string; readonly unit: string };

/**
 * 一个单元此刻的卡住态：block 顶掉整张卡片，notice 只在角上提示一句；读口与探针产出，卡片消费。
 */
export interface ModuleBlocker {
  readonly id: string;
  readonly severity: 'block' | 'notice';
  readonly title: string;
  readonly hint?: string;
  readonly detail?: string;
  readonly actions: readonly BlockerAction[];
}
