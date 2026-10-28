import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ApiResponse } from '@dsh-workbench/shared';
import type {
  ModuleVersion,
  ModuleVersionsPayload,
  WorkbenchSelfUpdate,
  WorkbenchVersion,
} from '@/kernel/contract/bundle-install';
import type { MarketInstalledPayload, MarketInstalledModule } from '@/kernel/contract/market-index';
import type { InstalledPlugin, InstalledPluginsPayload } from '@/shared/api/installed-plugins';
import { readInstalledPlugins, readModuleVersions } from '@/shared/hooks/bundle-queries';
import { readMarketInstalled } from '@/shared/hooks/market-queries';
import { CAPABILITY_FACT } from '@/shared/hooks/use-capabilities';
import { useFactRevision } from '@/shared/hooks/use-facts';

import { MARKET_STALE_MS, shouldProbeOnEnter } from '../rightbar/market-freshness';

export type VersionsScope = 'all' | 'modules' | 'plugins';
export type VersionsPart = Exclude<VersionsScope, 'all'>;

export interface VersionsCheck {
  readonly checking: boolean;
  readonly failed: boolean;
  readonly checkedAt: number | null;
}

export interface ModuleVersionsState {
  readonly modules: readonly ModuleVersion[] | null;
  readonly plugins: readonly InstalledPlugin[] | null;
  readonly workbench: WorkbenchVersion | null;
  readonly selfUpdate: WorkbenchSelfUpdate | null;
  readonly read: boolean;
  readonly allChecking: boolean;
  readonly modulesCheck: VersionsCheck;
  readonly pluginsCheck: VersionsCheck;
}

export interface ModuleVersionsView extends ModuleVersionsState {
  readonly checking: boolean;
  reload(options?: {
    readonly force?: boolean;
    readonly fresh?: boolean;
    readonly scope?: VersionsScope;
  }): void;
}

export interface ModuleVersionsRead {
  force?: boolean;
  fresh?: boolean;
  scope?: VersionsScope;
}

const IDLE: VersionsCheck = { checking: false, failed: false, checkedAt: null };

const NOT_READ: ModuleVersionsState = {
  modules: null,
  plugins: null,
  workbench: null,
  selfUpdate: null,
  read: false,
  allChecking: false,
  modulesCheck: IDLE,
  pluginsCheck: IDLE,
};

let state: ModuleVersionsState = NOT_READ;
const listeners = new Set<() => void>();
const inFlight = new Map<
  VersionsScope,
  { readonly force: boolean; readonly epoch: number; readonly promise: Promise<void> }
>();
const seq: Record<VersionsPart, number> = { modules: 0, plugins: 0 };
const newestForceSeq: Record<VersionsPart, number> = { modules: -1, plugins: -1 };
let epoch = 0;
let allSeq = 0;

export function bumpModuleVersionsEpoch(): void {
  epoch += 1;
}

export function moduleVersionsValue(): ModuleVersionsState {
  return state;
}

export function resetModuleVersions(): void {
  state = NOT_READ;
  allSeq = 0;
  listeners.clear();
  inFlight.clear();
  seq.modules = 0;
  seq.plugins = 0;
  newestForceSeq.modules = -1;
  newestForceSeq.plugins = -1;
  epoch = 0;
}

export function subscribeModuleVersions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function withMarketUpdates(
  modules: readonly ModuleVersion[],
  rows: readonly MarketInstalledModule[],
): readonly ModuleVersion[] {
  if (rows.length === 0) return modules;
  const byPkg = new Map(rows.map((row) => [row.pkg, row] as const));
  return modules.map((module) => {
    const row = byPkg.get(module.pkg);
    return row === undefined ? module : { ...module, latest: row.version, market: row };
  });
}

export function moduleVersionsCheckedAt(now: ModuleVersionsState): number | null {
  const at = [now.modulesCheck.checkedAt, now.pluginsCheck.checkedAt].filter(
    (one): one is number => one !== null,
  );
  return at.length === 0 ? null : Math.max(...at);
}

export function moduleVersionsChecking(value: ModuleVersionsState): boolean {
  return value.allChecking || value.modulesCheck.checking || value.pluginsCheck.checking;
}

function publish(next: ModuleVersionsState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

function partsOf(scope: VersionsScope): readonly VersionsPart[] {
  return scope === 'all' ? ['modules', 'plugins'] : [scope];
}

function checking(scope: VersionsScope): ModuleVersionsState {
  const mark = (seat: VersionsCheck): VersionsCheck => (seat.checking ? seat : { ...seat, checking: true });
  return {
    ...state,
    allChecking: scope === 'all' || state.allChecking,
    modulesCheck: scope === 'plugins' ? state.modulesCheck : mark(state.modulesCheck),
    pluginsCheck: scope === 'modules' ? state.pluginsCheck : mark(state.pluginsCheck),
  };
}

function landed(seat: VersionsCheck, ticket: number, latest: number, ok: boolean, at: number): VersionsCheck {
  return {
    checking: ticket === latest ? false : seat.checking,
    failed: !ok,
    checkedAt: ok ? at : seat.checkedAt,
  };
}

type ModulesResponse = readonly [ApiResponse<ModuleVersionsPayload>, ApiResponse<MarketInstalledPayload>];

function readModulesOnce(force: boolean): Promise<ModulesResponse | null> {
  return Promise.all([readModuleVersions(force), readMarketInstalled()]).catch(() => null);
}

function readPluginsOnce(force: boolean): Promise<ApiResponse<InstalledPluginsPayload> | null> {
  return readInstalledPlugins(force).catch(() => null);
}

export function runModuleVersionsRead(force = false, fresh = false, scope: VersionsScope = 'all'): Promise<void> {
  const at = epoch;
  const running = inFlight.get(scope);
  if (!fresh && running !== undefined && running.force === force && running.epoch === at) {
    return running.promise;
  }
  const allTicket = scope === 'all' ? (allSeq += 1) : allSeq;
  const tickets = new Map<VersionsPart, number>();
  for (const part of partsOf(scope)) {
    const ticket = (seq[part] += 1);
    tickets.set(part, ticket);
    if (force) newestForceSeq[part] = ticket;
  }
  publish(checking(scope));
  const modulesRead = tickets.has('modules') ? readModulesOnce(force) : null;
  const pluginsRead = tickets.has('plugins') ? readPluginsOnce(force) : null;
  const promise = Promise.all([modulesRead, pluginsRead])
    .then(([modules, plugins]) => {
      if (at !== epoch) return;
      const now = Date.now();
      const modulesTicket = tickets.get('modules');
      const pluginsTicket = tickets.get('plugins');
      const modulesLanded = modulesTicket !== undefined && (force || modulesTicket >= newestForceSeq.modules);
      const pluginsLanded = pluginsTicket !== undefined && (force || pluginsTicket >= newestForceSeq.plugins);
      const modulesOk = modulesLanded && modules !== null && modules[0].ok === true;
      const pluginsOk = pluginsLanded && plugins !== null && plugins.ok === true;
      publish({
        ...state,
        modules: modulesOk
          ? withMarketUpdates(modules[0].modules, modules[1].ok === true ? modules[1].modules : [])
          : state.modules,
        workbench: modulesOk ? (modules[0].workbench ?? null) : state.workbench,
        selfUpdate: modulesOk ? (modules[0].selfUpdate ?? null) : state.selfUpdate,
        plugins: pluginsOk ? plugins.plugins : state.plugins,
        read: true,
        allChecking: scope === 'all' && allTicket === allSeq ? false : state.allChecking,
        modulesCheck:
          modulesLanded && modulesTicket !== undefined
            ? landed(state.modulesCheck, modulesTicket, seq.modules, modulesOk, now)
            : state.modulesCheck,
        pluginsCheck:
          pluginsLanded && pluginsTicket !== undefined
            ? landed(state.pluginsCheck, pluginsTicket, seq.plugins, pluginsOk, now)
            : state.pluginsCheck,
      });
    })
    .finally(() => {
      if (inFlight.get(scope)?.promise === promise) inFlight.delete(scope);
    });
  inFlight.set(scope, { force, epoch: at, promise });
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
      !shouldProbeOnEnter({ checkedAt: moduleVersionsCheckedAt(state), now: Date.now(), staleMs: MARKET_STALE_MS })
    )
      return;
    void runModuleVersionsRead(false);
  }, [factRev]);

  const reload = useCallback((options?: ModuleVersionsRead): void => {
    void runModuleVersionsRead(options?.force === true, options?.fresh === true, options?.scope ?? 'all');
  }, []);

  return {
    ...value,
    checking: moduleVersionsChecking(value),
    reload,
  };
}
