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
  readonly unreadable: readonly { readonly pkg: string; readonly reason: string }[];
  readonly readFailure: string | null;
  readonly stale: boolean;
  readonly plugins: readonly InstalledPlugin[] | null;
  readonly workbench: WorkbenchVersion | null;
  readonly selfUpdate: WorkbenchSelfUpdate | null;
  readonly read: boolean;
  readonly allChecking: boolean;
  readonly marketProblem: MarketInstalledPayload['problem'] | null;
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
  unreadable: [],
  readFailure: null,
  stale: false,
  plugins: null,
  workbench: null,
  selfUpdate: null,
  read: false,
  allChecking: false,
  marketProblem: null,
  modulesCheck: IDLE,
  pluginsCheck: IDLE,
};

let state: ModuleVersionsState = NOT_READ;
const listeners = new Set<() => void>();
const inFlight = new Map<string, { readonly epoch: number; readonly promise: Promise<void> }>();
const seq: Record<VersionsPart, number> = { modules: 0, plugins: 0 };
const checkSeq: Record<VersionsPart, number> = { modules: 0, plugins: 0 };
const newestForceSeq: Record<VersionsPart, number> = { modules: -1, plugins: -1 };
const newestDataSeq: Record<VersionsPart, number> = { modules: -1, plugins: -1 };
let epoch = 0;
let checkAllSeq = 0;
const marketInstalledInFlight = new Map<string, Promise<ApiResponse<MarketInstalledPayload>>>();

export function bumpModuleVersionsEpoch(): void {
  epoch += 1;
}

export function moduleVersionsValue(): ModuleVersionsState {
  return state;
}

export function resetModuleVersions(): void {
  state = NOT_READ;
  checkAllSeq = 0;
  listeners.clear();
  inFlight.clear();
  seq.modules = 0;
  seq.plugins = 0;
  checkSeq.modules = 0;
  checkSeq.plugins = 0;
  newestForceSeq.modules = -1;
  newestForceSeq.plugins = -1;
  newestDataSeq.modules = -1;
  newestDataSeq.plugins = -1;
  epoch = 0;
  marketInstalledInFlight.clear();
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
  if (next === null || previous === null || next.pkg !== previous.pkg) return next;
  if (next.latest === undefined) {
    if (previous.latest === undefined) return next;
    return {
      ...next,
      latest: previous.latest,
      ...(previous.latestBlocked === undefined ? {} : { latestBlocked: previous.latestBlocked }),
    };
  }
  if (
    next.latestBlocked === undefined &&
    previous.latestBlocked !== undefined &&
    next.latest === previous.latest
  ) {
    return { ...next, latestBlocked: previous.latestBlocked };
  }
  return next;
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

function released(seat: VersionsCheck, ticket: number, latest: number): VersionsCheck {
  return ticket === latest && seat.checking ? { ...seat, checking: false } : seat;
}

type ModulesResponse = readonly [ApiResponse<ModuleVersionsPayload>, ApiResponse<MarketInstalledPayload>];

function readMarketInstalledShared(force: boolean, check: boolean): Promise<ApiResponse<MarketInstalledPayload>> {
  const key = `${check ? 'check' : 'data'}:${force ? 'force' : 'ttl'}`;
  const running = marketInstalledInFlight.get(key);
  if (running !== undefined) return running;
  const promise = readMarketInstalled({ check, force }).finally(() => {
    if (marketInstalledInFlight.get(key) === promise) marketInstalledInFlight.delete(key);
  });
  marketInstalledInFlight.set(key, promise);
  return promise;
}

let lastModulesFailure: string | null = null;

function failureTextOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function readModulesOnce(force: boolean, check: boolean): Promise<ModulesResponse | null> {
  return Promise.all([readModuleVersions(force, check), readMarketInstalledShared(force, check)]).catch((reason) => {
    lastModulesFailure = failureTextOf(reason);
    return null;
  });
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
  const checkAllTicket = check && run.scope === 'all' ? (checkAllSeq += 1) : checkAllSeq;
  const tickets = new Map<VersionsPart, number>();
  const checkTickets = new Map<VersionsPart, number>();
  for (const part of partsOf(run.scope)) {
    const ticket = (seq[part] += 1);
    tickets.set(part, ticket);
    if (check) {
      checkSeq[part] += 1;
      checkTickets.set(part, checkSeq[part]);
    }
    if (run.force) newestForceSeq[part] = ticket;
    if (!check) newestDataSeq[part] = ticket;
  }
  if (check) publish(checking(run.scope));
  const checkSeatOf = (part: VersionsPart): VersionsCheck =>
    part === 'modules' ? state.modulesCheck : state.pluginsCheck;
  const dropped = (part: VersionsPart, ticket: number, checkTicket: number): boolean => {
    if (at === epoch && !superseded(run, part, ticket)) return false;
    const seat = released(checkSeatOf(part), checkTicket, checkSeq[part]);
    if (check && seat !== checkSeatOf(part)) {
      publish(part === 'modules' ? { ...state, modulesCheck: seat } : { ...state, pluginsCheck: seat });
    }
    return true;
  };
  const modulesTicket = tickets.get('modules');
  const pluginsTicket = tickets.get('plugins');
  const modulesCheckTicket = checkTickets.get('modules') ?? 0;
  const pluginsCheckTicket = checkTickets.get('plugins') ?? 0;
  const publishReadFailure = (message: string): void => {
    publish({
      ...state,
      read: true,
      readFailure: message,
      stale: moduleVersionsValue().modules !== null,
      ...(check
        ? {
            modulesCheck: landed(
              state.modulesCheck,
              modulesCheckTicket,
              checkSeq.modules,
              false,
              Date.now(),
            ),
          }
        : {}),
    });
  };
  const modulesRead =
    modulesTicket === undefined
      ? null
      : readModulesOnce(run.force, check).then((response) => {
          if (dropped('modules', modulesTicket, modulesCheckTicket)) return;
          if (response === null) {
            publishReadFailure(lastModulesFailure ?? '安装清单没读出来');
            return;
          }
          const [modules, market] = response;
          const marketFailure = market.ok === true ? null : market.error.message;
          if (modules.ok !== true) {
            publishReadFailure(modules.error.message);
            return;
          }
          const payload = modules;
          const listed =
            payload === null
              ? null
              : withMarketUpdates(payload.modules, market.ok === true ? market.modules : []);
          const shown = listed === null ? null : check ? listed : withPreviousLatest(listed, state.modules ?? []);
          publish({
            ...state,
            readFailure: marketFailure,
            stale: payload === null && moduleVersionsValue().modules !== null,
            ...(check && market.ok === true ? { marketProblem: market.problem ?? null } : {}),
            unreadable: check ? (payload?.unreadable ?? []) : state.unreadable,
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
                    modulesCheckTicket,
                    checkSeq.modules,
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
          if (dropped('plugins', pluginsTicket, pluginsCheckTicket)) return;
          if (response === null) {
            if (check) {
              publish({
                ...state,
                pluginsCheck: landed(
                  state.pluginsCheck,
                  pluginsCheckTicket,
                  checkSeq.plugins,
                  false,
                  Date.now(),
                ),
              });
            }
            return;
          }
          const ok = response.ok === true;
          publish({
            ...state,
            plugins: ok
              ? check
                ? response.plugins
                : withPreviousPluginLatest(response.plugins, state.plugins ?? [])
              : state.plugins,
            ...(check
              ? {
                  pluginsCheck: landed(
                    state.pluginsCheck,
                    pluginsCheckTicket,
                    checkSeq.plugins,
                    ok,
                    Date.now(),
                  ),
                }
              : {}),
          });
        });
  const promise = Promise.all([modulesRead, pluginsRead])
    .then(() => {
      if (!check || run.scope !== 'all' || checkAllTicket !== checkAllSeq) return;
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
