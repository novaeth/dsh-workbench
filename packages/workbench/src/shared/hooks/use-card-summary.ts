import { useEffect } from 'react';

/**
 * 卡片报给面板那一格的两个数：`refreshing` 还在不在忙、`at` 最近一次读到值的时间（没有是 `null`）。
 */
export interface CardSummary {
  readonly refreshing: boolean;
  readonly at: number | null;
}

/**
 * 自己搭卡片、要把 `{ refreshing, at }` 在变化时交给调用点上报面板时调用；`onSummary` 要稳定引用
 * （一般 `useCallback`），否则每次渲染都会上报一次。`useUnitBoard` 已经把这条接好。
 */
export function useCardSummary(
  onSummary: (summary: CardSummary) => void,
  summary: { readonly refreshing: boolean; readonly at: number | null | undefined },
): void {
  const { refreshing } = summary;
  const at = summary.at ?? null;
  useEffect(() => {
    onSummary({ refreshing, at });
  }, [onSummary, refreshing, at]);
}
