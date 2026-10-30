import { useCallback, useEffect, useSyncExternalStore } from 'react';
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

export interface ModuleVersionsRead {
  check?: boolean;
  force?: boolean;
  fresh?: boolean;
  scope?: VersionsScope;
}

export interface InstalledReadOptions {
  readonly fresh?: boolean;
}

export interface ModuleVersionsView extends ModuleVersionsState {
  readonly checking: boolean;
  reload(options?: ModuleVersionsRead): void;
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
const inFlight = new Map<string, { readonly epoch: number; readonly promise: Promise<void> }>();
const seq: Record<VersionsPart, number> = { modules: 0, plugins: 0 };
const newestForceSeq: Record<VersionsPart, number> = { modules: -1, plugins: -1 };
const newestDataSeq: Record<VersionsPart, number> = { modules: -1, plugins: -1 };
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
  newestDataSeq.modules = -1;
  newestDataSeq.plugins = -1;
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

function withPreviousLatest(
  modules: readonly ModuleVersion[],
  previous: readonly ModuleVersion[],
): readonly ModuleVersion[] {
  if (previous.length === 0) return modules;
  const byPkg = new Map(previous.map((module) => [module.pkg, module] as const));
  return modules.map((module) => {
    const old = byPkg.get(module.pkg);
    if (old === undefined) return module;
    return {
      ...module,
      ...(module.latest === undefined && old.latest !== undefined ? { latest: old.latest } : {}),
      ...(module.latestBlocked === undefined && old.latestBlocked !== undefined
        ? { latestBlocked: old.latestBlocked }
        : {}),
      ...(module.latestUnavailable === undefined && old.latestUnavailable !== undefined
        ? { latestUnavailable: old.latestUnavailable }
        : {}),
    };
  });
}

function withPreviousPluginLatest(
  plugins: readonly InstalledPlugin[],
  previous: readonly InstalledPlugin[],
): readonly InstalledPlugin[] {
  if (previous.length === 0) return plugins;
  const byPkg = new Map(previous.map((plugin) => [plugin.pkg, plugin] as const));
  return plugins.map((plugin) => {
    const old = byPkg.get(plugin.pkg);
    if (old === undefined || plugin.latest !== undefined || old.latest === undefined) return plugin;
    return { ...plugin, latest: old.latest };
  });
}

function withPreviousWorkbenchLatest(
  next: WorkbenchVersion | null,
  previous: WorkbenchVersion | null,
): WorkbenchVersion | null {
  if (next === null || previous === null) return next;
  if (next.latest !== undefined || previous.latest === undefined || next.pkg !== previous.pkg) return next;
  return { ...next, latest: previous.latest };
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

function readModulesOnce(force: boolean, check: boolean): Promise<ModulesResponse | null> {
  return Promise.all([readModuleVersions(force, check), readMarketInstalled()]).catch(() => null);
}

function readPluginsOnce(force: boolean, check: boolean): Promise<ApiResponse<InstalledPluginsPayload> | null> {
  return readInstalledPlugins(force, check).catch(() => null);
}

interface ReadRun {
  readonly kind: 'data' | 'check';
  readonly force: boolean;
  readonly fresh: boolean;
  readonly scope: VersionsScope;
}

function readKey(run: ReadRun): string {
  return `${run.kind}:${run.scope}:${run.force ? 'force' : 'cached'}`;
}

function superseded(run: ReadRun, part: VersionsPart, ticket: number): boolean {
  if (run.kind === 'data') return ticket < newestDataSeq[part];
  return !run.force && ticket < newestForceSeq[part];
}

function runRead(run: ReadRun): Promise<void> {
  const at = epoch;
  const key = readKey(run);
  const running = inFlight.get(key);
  if (!run.fresh && running !== undefined && running.epoch === at) return running.promise;
  const check = run.kind === 'check';
  const allTicket = run.scope === 'all' ? (allSeq += 1) : allSeq;
  const tickets = new Map<VersionsPart, number>();
  for (const part of partsOf(run.scope)) {
    const ticket = (seq[part] += 1);
    tickets.set(part, ticket);
    if (run.force) newestForceSeq[part] = ticket;
    if (!check) newestDataSeq[part] = ticket;
  }
  if (check) publish(checking(run.scope));
  const modulesTicket = tickets.get('modules');
  const pluginsTicket = tickets.get('plugins');
  const modulesRead =
    modulesTicket === undefined
      ? null
      : readModulesOnce(run.force, check).then((response) => {
          if (at !== epoch || response === null || superseded(run, 'modules', modulesTicket)) return;
          const [modules, market] = response;
          const payload = modules.ok === true ? modules : null;
          const listed =
            payload === null
              ? null
              : withMarketUpdates(payload.modules, market.ok === true ? market.modules : []);
          const shown = listed === null ? null : check ? listed : withPreviousLatest(listed, state.modules ?? []);
          publish({
            ...state,
            modules: shown ?? state.modules,
            workbench:
              payload === null
                ? state.workbench
                : check
                  ? (payload.workbench ?? null)
                  : withPreviousWorkbenchLatest(payload.workbench ?? null, state.workbench),
            selfUpdate: payload === null ? state.selfUpdate : (payload.selfUpdate ?? null),
            read: true,
            ...(check
              ? {
                  modulesCheck: landed(
                    state.modulesCheck,
                    modulesTicket,
                    seq.modules,
                    payload !== null,
                    Date.now(),
                  ),
                }
              : {}),
          });
        });
  const pluginsRead =
    pluginsTicket === undefined
      ? null
      : readPluginsOnce(run.force, check).then((response) => {
          if (at !== epoch || response === null || superseded(run, 'plugins', pluginsTicket)) return;
          const ok = response.ok === true;
          publish({
            ...state,
            plugins: ok
              ? check
                ? response.plugins
                : withPreviousPluginLatest(response.plugins, state.plugins ?? [])
              : state.plugins,
            ...(check
              ? { pluginsCheck: landed(state.pluginsCheck, pluginsTicket, seq.plugins, ok, Date.now()) }
              : {}),
          });
        });
  const promise = Promise.all([modulesRead, pluginsRead])
    .then(() => {
      if (at !== epoch || !check || run.scope !== 'all' || allTicket !== allSeq) return;
      if (!state.allChecking) return;
      publish({ ...state, allChecking: false });
    })
    .finally(() => {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
    });
  inFlight.set(key, { epoch: at, promise });
  return promise;
}

export function runModuleVersionsRead(
  force = false,
  fresh = false,
  scope: VersionsScope = 'all',
): Promise<void> {
  return runRead({ kind: 'check', force, fresh, scope });
}

export function runInstalledRead(options: InstalledReadOptions = {}): Promise<void> {
  return runRead({ kind: 'data', force: false, fresh: options.fresh === true, scope: 'all' });
}

export function useModuleVersions(): ModuleVersionsView {
  const value = useSyncExternalStore(subscribeModuleVersions, moduleVersionsValue);
  const factRev = useFactRevision(CAPABILITY_FACT);

  useEffect(() => {
    void runInstalledRead();
  }, [factRev]);

  const reload = useCallback((options?: ModuleVersionsRead): void => {
    if (options?.check === true) {
      void runModuleVersionsRead(options.force === true, options.fresh === true, options.scope ?? 'all');
      return;
    }
    void runInstalledRead({ fresh: options?.fresh === true });
  }, []);

  return {
    ...value,
    checking: moduleVersionsChecking(value),
    reload,
  };
}
