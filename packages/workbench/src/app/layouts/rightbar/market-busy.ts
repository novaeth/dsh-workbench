import { useEffect, useSyncExternalStore } from 'react';

import { WORKBENCH_SWAP_MS } from './market-settle';

const listeners = new Set<() => void>();
let published = new Map<string, number>();
let live: ReadonlySet<string> = new Set();
let timer: ReturnType<typeof setTimeout> | undefined;

export const MARKET_BUSY_MS = WORKBENCH_SWAP_MS;

export function marketBusyIds(): ReadonlySet<string> {
  return live;
}

export function publishMarketBusy(ids: readonly string[]): void {
  const now = Date.now();
  const next = new Map<string, number>();
  for (const id of new Set(ids)) next.set(id, published.get(id) ?? now);
  published = next;
  refresh(now);
}

export function subscribeMarketBusy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMarketBusy(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeMarketBusy, marketBusyIds);
}

export function usePublishMarketBusy(id: string | null): void {
  useEffect(() => {
    publishMarketBusy(id === null ? [] : [id]);
  }, [id]);
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

function schedule(now: number): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  let soonest = Number.POSITIVE_INFINITY;
  for (const at of published.values()) soonest = Math.min(soonest, at);
  if (soonest === Number.POSITIVE_INFINITY) return;
  timer = setTimeout(() => refresh(Date.now()), Math.max(0, soonest + MARKET_BUSY_MS - now) + 1);
}

function refresh(now: number): void {
  for (const [id, at] of published) if (now - at >= MARKET_BUSY_MS) published.delete(id);
  const next = new Set(published.keys());
  if (!sameSet(live, next)) {
    live = next;
    for (const listener of [...listeners]) listener();
  }
  schedule(now);
}
