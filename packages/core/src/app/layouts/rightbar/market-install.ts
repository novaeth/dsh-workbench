import { useEffect, useSyncExternalStore } from 'react';

import { MODULE_SETTLE_MS } from './market-settle';

export interface MarketInstallState {
  readonly installing: boolean;
  readonly applied: ReadonlySet<string>;
}

const NO_UNITS: ReadonlySet<string> = new Set();
const IDLE: MarketInstallState = { installing: false, applied: NO_UNITS };

const tokens = new Set<string>();
const applied = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: MarketInstallState = IDLE;
let timer: ReturnType<typeof setTimeout> | undefined;

function sameUnits(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const unit of left) if (!right.has(unit)) return false;
  return true;
}

function schedule(now: number): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  if (applied.size === 0) return;
  let soonest = Number.POSITIVE_INFINITY;
  for (const at of applied.values()) soonest = Math.min(soonest, at);
  timer = setTimeout(() => refresh(Date.now()), Math.max(0, soonest + MODULE_SETTLE_MS - now) + 1);
}

function refresh(now: number): void {
  for (const [unit, at] of applied) if (now - at >= MODULE_SETTLE_MS) applied.delete(unit);
  const next: MarketInstallState =
    tokens.size === 0 && applied.size === 0
      ? IDLE
      : { installing: tokens.size > 0, applied: applied.size === 0 ? NO_UNITS : new Set(applied.keys()) };
  if (next.installing !== snapshot.installing || !sameUnits(next.applied, snapshot.applied)) {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }
  schedule(now);
}

export function marketInstallState(): MarketInstallState {
  return snapshot;
}

export function subscribeMarketInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishMarketInstalling(token: string, active: boolean): void {
  if (active) tokens.add(token);
  else tokens.delete(token);
  refresh(Date.now());
}

export function publishMarketApplied(units: readonly string[]): void {
  const now = Date.now();
  for (const unit of new Set(units)) {
    if (unit !== '' && !applied.has(unit)) applied.set(unit, now);
  }
  refresh(now);
}

export function resetMarketInstall(): void {
  tokens.clear();
  applied.clear();
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  snapshot = IDLE;
  for (const listener of [...listeners]) listener();
}

export function useMarketInstallState(): MarketInstallState {
  return useSyncExternalStore(subscribeMarketInstall, marketInstallState);
}

export function usePublishMarketInstalling(token: string, active: boolean): void {
  useEffect(() => {
    publishMarketInstalling(token, active);
    return () => publishMarketInstalling(token, false);
  }, [token, active]);
}
