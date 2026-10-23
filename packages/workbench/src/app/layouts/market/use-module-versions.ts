import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ModuleVersion, WorkbenchSelfUpdate, WorkbenchVersion } from '@/shared/api/bundle-install';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import { readInstalledPlugins, readModuleVersions } from '@/shared/hooks/bundle-queries';
import { CAPABILITY_FACT } from '@/shared/hooks/use-capabilities';
import { useFactRevision } from '@/shared/hooks/use-facts';

import { MARKET_STALE_MS, shouldProbeOnEnter } from '../rightbar/market-freshness';

export interface ModuleVersionsState {
  readonly modules: readonly ModuleVersion[] | null;
  readonly plugins: readonly InstalledPlugin[] | null;
  readonly workbench: WorkbenchVersion | null;
  readonly selfUpdate: WorkbenchSelfUpdate | null;
  readonly read: boolean;
  readonly checkedAt: number | null;
}

export interface ModuleVersionsView extends ModuleVersionsState {
  reload(options?: { readonly force?: boolean; readonly fresh?: boolean }): void;
}

const NOT_READ: ModuleVersionsState = {
  modules: null,
  plugins: null,
  workbench: null,
  selfUpdate: null,
  read: false,
  checkedAt: null,
};

let state: ModuleVersionsState = NOT_READ;
const listeners = new Set<() => void>();
let inFlight: { readonly force: boolean; readonly epoch: number; readonly promise: Promise<void> } | null = null;
let readSeq = 0;
let newestForceSeq = -1;
let epoch = 0;

export function bumpModuleVersionsEpoch(): void {
  epoch += 1;
}

export function moduleVersionsValue(): ModuleVersionsState {
  return state;
}

export function resetModuleVersions(): void {
  state = NOT_READ;
  listeners.clear();
  inFlight = null;
  readSeq = 0;
  newestForceSeq = -1;
  epoch = 0;
}

export function subscribeModuleVersions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: ModuleVersionsState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

export function runModuleVersionsRead(force = false, fresh = false): Promise<void> {
  const at = epoch;
  if (!fresh && inFlight !== null && inFlight.force === force && inFlight.epoch === at) {
    return inFlight.promise;
  }
  const seq = (readSeq += 1);
  if (force) newestForceSeq = seq;
  const promise = Promise.all([readModuleVersions(force), readInstalledPlugins(force)])
    .catch(() => null)
    .then((responses) => {
      if (at !== epoch) return;
      if (!force && seq < newestForceSeq) return;
      const versions = responses?.[0];
      const plugins = responses?.[1];
      publish({
        modules: versions?.ok === true ? versions.modules : state.modules,
        plugins: plugins?.ok === true ? plugins.plugins : state.plugins,
        workbench: versions?.ok === true ? (versions.workbench ?? null) : state.workbench,
        selfUpdate: versions?.ok === true ? (versions.selfUpdate ?? null) : state.selfUpdate,
        read: true,
        checkedAt: Date.now(),
      });
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { force, epoch: at, promise };
  return promise;
}

export function useModuleVersions(): ModuleVersionsView {
  const value = useSyncExternalStore(subscribeModuleVersions, moduleVersionsValue);
  const factRev = useFactRevision(CAPABILITY_FACT);
  const mountedRef = useRef(false);

  useEffect(() => {
    const first = !mountedRef.current;
    mountedRef.current = true;
    if (
      first &&
      !shouldProbeOnEnter({ checkedAt: state.checkedAt, now: Date.now(), staleMs: MARKET_STALE_MS })
    )
      return;
    void runModuleVersionsRead(false);
  }, [factRev]);

  const reload = useCallback((options?: { readonly force?: boolean; readonly fresh?: boolean }): void => {
    void runModuleVersionsRead(options?.force === true, options?.fresh === true);
  }, []);

  return {
    modules: value.modules,
    plugins: value.plugins,
    workbench: value.workbench,
    selfUpdate: value.selfUpdate,
    read: value.read,
    checkedAt: value.checkedAt,
    reload,
  };
}
