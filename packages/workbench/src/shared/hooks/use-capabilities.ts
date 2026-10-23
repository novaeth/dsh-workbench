import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { CapabilityPayload } from '@dsh-workbench/shared';
import { apiGet } from '@dsh-workbench/shared';

import { useFactRevision } from './use-facts';

export function shouldForce(refreshToken: number, previousToken: number): boolean {
  return refreshToken !== previousToken;
}

export type CapabilityMap = Record<string, CapabilityPayload>;

export interface CapabilityProbeState {
  readonly checkedAt: number | null;
  readonly checking: boolean;
}

const NO_PROBE: CapabilityProbeState = { checkedAt: null, checking: false };

let silentNextProbe = false;

export function markNextProbeSilent(): void {
  silentNextProbe = true;
}

let probe: CapabilityProbeState = NO_PROBE;

const probeListeners = new Set<() => void>();

export function probeValue(): CapabilityProbeState {
  return probe;
}

export function subscribeProbe(listener: () => void): () => void {
  probeListeners.add(listener);
  return () => {
    probeListeners.delete(listener);
  };
}

function setProbe(next: CapabilityProbeState): void {
  if (next === probe) return;
  probe = next;
  for (const listener of [...probeListeners]) listener();
}

export const CAPABILITY_FACT = 'capability';

let shared: { readonly force: boolean; readonly epoch: number; readonly promise: Promise<CapabilityMap | null> } | null = null;

let epoch = 0;

export function bumpCapabilityEpoch(): void {
  epoch += 1;
}

let current: CapabilityMap | null = null;

const listeners = new Set<() => void>();

export function capabilityValue(): CapabilityMap | null {
  return current;
}

export function subscribeCapabilities(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setCapabilities(next: CapabilityMap | null, rechecked = false): void {
  if (next === null) setProbe(NO_PROBE);
  else if (rechecked) setProbe({ ...probe, checkedAt: Date.now() });
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export function beginProbe(): void {
  if (probe.checking) return;
  setProbe({ ...probe, checking: true });
}

export function endProbe(): void {
  setProbe({ ...probe, checking: false });
}

async function fetchAll(force: boolean): Promise<CapabilityMap | null> {
  const response = await apiGet<{ units?: CapabilityPayload[] }>(
    'capability',
    force ? { force: 1 } : {},
  ).catch(() => null);
  if (response?.ok !== true || !Array.isArray(response.units)) return null;
  return Object.fromEntries(response.units.map((unit) => [unit.unit, unit]));
}

export function publishCapability(result: CapabilityMap | null, rechecked = false): boolean {
  if (result !== null) {
    setCapabilities(result, rechecked);
    return true;
  }
  if (capabilityValue() !== null) return false;
  setCapabilities({});
  return true;
}

export function shareCapabilityFetch(
  force: boolean,
  load: (force: boolean) => Promise<CapabilityMap | null>,
): Promise<CapabilityMap | null> {
  const at = epoch;
  if (shared !== null && shared.force === force && shared.epoch === at) return shared.promise;
  const promise = load(force).finally(() => {
    if (shared?.promise === promise) shared = null;
  });
  shared = { force, epoch: at, promise };
  return promise;
}

let readSeq = 0;

let newestForceSeq = -1;

export function runCapabilityRead(options: {
  readonly force: boolean;
  readonly silent?: boolean;
  readonly load?: (force: boolean) => Promise<CapabilityMap | null>;
}): Promise<void> {
  const { force, silent = false, load = fetchAll } = options;
  const at = epoch;
  const seq = (readSeq += 1);
  if (force) newestForceSeq = seq;
  if (force && !silent) beginProbe();

  return shareCapabilityFetch(force, load)
    .then((result) => {
      if (at !== epoch) return;
      if (!force && seq < newestForceSeq) return;
      publishCapability(result, force);
    })
    .finally(() => {
      if (force) endProbe();
    });
}

export function useCapabilities(refreshToken: number, reloadToken = 0): CapabilityMap | null {
  const value = useSyncExternalStore(subscribeCapabilities, capabilityValue);
  const previous = useRef(refreshToken);
  const factRev = useFactRevision(CAPABILITY_FACT);

  useEffect(() => {
    const force = shouldForce(refreshToken, previous.current);
    previous.current = refreshToken;
    const silent = silentNextProbe;
    silentNextProbe = false;

    void runCapabilityRead({ force, silent });

  }, [refreshToken, factRev, reloadToken]);

  return value;
}

export function useCapabilityProbe(): CapabilityProbeState {
  return useSyncExternalStore(subscribeProbe, probeValue);
}
