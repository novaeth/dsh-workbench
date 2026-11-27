import { useEffect, useSyncExternalStore } from 'react';

import type { Pending } from './market-view-text';
import type { MarketFailure } from './market-row-types';

export interface MarketTransient {
  readonly pending: Pending | null;
  readonly setPending: (next: Pending | null) => void;
  readonly confirming: string | null;
  readonly setConfirming: (next: string | null) => void;
  readonly failed: MarketFailure | null;
  readonly setFailed: (next: MarketFailure | null) => void;
  readonly notice: string | null;
  readonly setNotice: (next: string | null) => void;
}

interface MarketTransientFacts {
  readonly pending: Pending | null;
  readonly confirming: string | null;
  readonly failed: MarketFailure | null;
  readonly notice: string | null;
}

const IDLE: MarketTransientFacts = {
  pending: null,
  confirming: null,
  failed: null,
  notice: null,
};

let facts = IDLE;
const listeners = new Set<() => void>();

function sameFacts(left: MarketTransientFacts, right: MarketTransientFacts): boolean {
  return (
    left.pending === right.pending &&
    left.confirming === right.confirming &&
    left.failed === right.failed &&
    left.notice === right.notice
  );
}

function publish(next: MarketTransientFacts): void {
  if (sameFacts(next, facts)) return;
  facts = next;
  for (const listener of [...listeners]) listener();
}

export function marketTransientFacts(): MarketTransientFacts {
  return facts;
}

export function subscribeMarketTransient(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetMarketTransient(): void {
  publish(IDLE);
}

export const setMarketPending = (next: Pending | null): void => publish({ ...facts, pending: next });

export const setMarketConfirming = (next: string | null): void => publish({ ...facts, confirming: next });

export const setMarketFailed = (next: MarketFailure | null): void => publish({ ...facts, failed: next });

export const setMarketNotice = (next: string | null): void => publish({ ...facts, notice: next });

export function useMarketTransient(input: {
  readonly onPending?: ((pending: boolean) => void) | undefined;
}): MarketTransient {
  const { onPending } = input;
  const live = useSyncExternalStore(subscribeMarketTransient, marketTransientFacts);

  useEffect(() => {
    onPending?.(live.pending !== null);
    return () => onPending?.(false);
  }, [live.pending, onPending]);

  return {
    pending: live.pending,
    setPending: setMarketPending,
    confirming: live.confirming,
    setConfirming: setMarketConfirming,
    failed: live.failed,
    setFailed: setMarketFailed,
    notice: live.notice,
    setNotice: setMarketNotice,
  };
}
