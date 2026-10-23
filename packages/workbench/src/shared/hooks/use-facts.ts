import { useCallback, useSyncExternalStore } from 'react';
import { createFactChannel } from '@dsh-workbench/shared';

import { createAdaptiveTransport } from './fact-transports';

const channel = createFactChannel({ transport: createAdaptiveTransport() });

/**
 * 渲染里要“这条事实的版本号”时调用：版本一变，喂给 `useApiResource` 的 key 就变、读自动重来。
 * 卡片读数默认订的 `factOfRoute(route)` 已经接好，只有要订别的事实才显式传 `fact`。
 */
export function useFactRevision(fact: string): number {
  const subscribe = useCallback((listener: () => void) => channel.subscribe(fact, listener), [fact]);
  const snapshot = useCallback(() => channel.revisionOf(fact), [fact]);
  return useSyncExternalStore(subscribe, snapshot);
}

/**
 * 不在渲染里的地方（宿主事件、定时器里看到的旧值）要听事实变化时用它；返回值就是退订函数，用完记得退。
 */
export function subscribeFactRevision(fact: string, listener: () => void): () => void {
  return channel.subscribe(fact, listener);
}

/**
 * 写完之后把这条事实标脏时调用：不标，面板就停在旧值；不传 `fact` 是把所有事实一起标脏。
 */
export function useFactInvalidate(): (fact?: string) => void {
  return useCallback((fact?: string) => channel.refresh(fact), []);
}
