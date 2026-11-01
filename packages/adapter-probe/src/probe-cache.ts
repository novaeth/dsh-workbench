import { now as clockNow } from '@dsh-workbench/shared/host';

export interface TimedMemo<T> {
  get(key: string, now?: number): T | undefined;
  set(key: string, value: T, now?: number): void;
  clear(): void;
}

export function createTimedMemo<T>(ttlMs: number): TimedMemo<T> {
  const entries = new Map<string, { readonly at: number; readonly value: T }>();
  return {
    get(key, now: number = clockNow()) {
      const hit = entries.get(key);
      if (hit === undefined) return undefined;
      if (now - hit.at >= ttlMs) return undefined;
      return hit.value;
    },
    set(key, value, now: number = clockNow()) {
      entries.set(key, { at: now, value });
    },
    clear() {
      entries.clear();
    },
  };
}
