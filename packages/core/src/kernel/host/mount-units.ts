import type { DshHostContext } from '@dsh-workbench/shared';
import type { DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import { runsRouteOf, stopRouteOf } from '@dsh-workbench/shared/host';
import { APPROVAL_NOTE_ARG } from '@dsh-workbench/shared/host';
import type { UnitManifest } from '@dsh-workbench/shared/host';
import { param, type RouteTable } from '@dsh-workbench/shared/host';
import { createHostKit, createLongTaskHost } from '@dsh-workbench/shared/host';
import type {
  ContextRenderer,
  LongTaskBase,
  LongTaskChange,
  LongTaskRegistry,
  UnitMountDeps,
  UnitMountResult,
  UnitCall,
} from '@dsh-workbench/shared/host';
import type { DataReader } from '@dsh-workbench/shared/host';
import type { HostUnit } from './unit-registry';
import { unitReadiness, type UnitReadiness } from './unit-readiness';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';

function withRunsRoute(result: UnitMountResult, unit: string): UnitMountResult {
  const runs = result.longTasks;
  if (runs === undefined) return result;
  return {
    ...result,
    routes: {
      ...result.routes,
      [runsRouteOf(unit)]: (search: URLSearchParams) => {
        const path = (param(search, 'path') ?? '').trim();
        return { ok: true, runs: path === '' ? [] : runs.current(path) };
      },
    },
    actions: [
      ...(result.actions ?? []),
      {
        resource: stopRouteOf(unit),
        handle(payload) {
          if (typeof runs.stop !== 'function') {
            return { ok: false, text: '这一份工作台还是上一版的注册表，停不了 —— 重新起一下工作台就能停' };
          }
          const id = (payload as { readonly id?: unknown } | null)?.id;
          if (typeof id !== 'string' || id.trim() === '') {
            return { ok: false, text: '要停哪一趟？给一个 id 才成' };
          }
          if (runs.snapshot(id) === null) {
            return { ok: false, text: '没有这一趟 —— id 对不上，没什么可停的' };
          }
          return { ok: true, stopped: runs.stop(id) };
        },
      },
    ],
  };
}

function declaresNote(definition: DshToolDefinition): boolean {
  const parameters = definition.parameters;
  if (typeof parameters !== 'object' || parameters === null) return false;
  const properties = (parameters as Record<string, unknown>)['properties'];
  if (typeof properties !== 'object' || properties === null) return false;
  return APPROVAL_NOTE_ARG in (properties as Record<string, unknown>);
}

export function declaredNotesOf(
  plans: Iterable<{ readonly declaredNotes: ReadonlySet<string> }>,
): ReadonlySet<string> {
  return new Set([...plans].flatMap((plan) => [...plan.declaredNotes]));
}

function journaledRegistry(
  registry: DshToolRegistry,
  journal: Array<() => void>,
  declaredNotes: Set<string>,
): DshToolRegistry {
  return {
    register(definition: DshToolDefinition) {
      const registered = registry.register(definition);
      journal.push(registered);
      if (declaresNote(definition)) declaredNotes.add(definition.name);
      return registered;
    },
  };
}

function scopedMountCtx(
  ctx: DshHostContext,
  registry: DshToolRegistry,
  journal: Array<() => void>,
  declaredNotes: Set<string>,
): DshHostContext {
  const tools = journaledRegistry(registry, journal, declaredNotes);
  const get = (name: string, strict?: boolean): unknown => {
    const value = ctx.get(name, strict);
    return name === 'tools' && value !== undefined ? tools : value;
  };
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'get') return get;
      const value = Reflect.get(target, key, target) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as DshHostContext;
}

export interface UnitFailure {
  readonly id: string;
  readonly reason: string;
}

export interface MountedUnit {
  readonly host: HostUnit;
  readonly result: UnitMountResult;
  readonly readiness: UnitReadiness;
  readonly rollbackTools: () => void;
}

export interface UnitsPlan {
  readonly mounted: readonly MountedUnit[];
  readonly routes: RouteTable;
  readonly gate: UnitMountResult['gate'];
  readonly prefs: ReadonlyArray<NamedEntry & { readonly unit: string }>;
  readonly actions: ReadonlyArray<NamedEntry & { readonly unit: string }>;
  readonly provision: UnitMountResult['provision'];
  readonly contextRenderers: ReadonlyMap<string, ContextRenderer>;
  readonly owners: ReadonlyMap<string, string>;
  readonly routesOfUnit: ReadonlyMap<string, readonly string[]>;
  readonly factsOf: ReadonlyMap<string, (call: UnitCall) => readonly string[] | undefined>;
  readonly skipped: ReadonlyArray<{ readonly id: string; readonly missing: readonly string[] }>;
  readonly failed: readonly UnitFailure[];
  readonly warmReads: () => readonly (readonly string[])[];
  readonly declaredNotes: ReadonlySet<string>;
  readonly disposeLongTasks: () => void;
}

interface NamedEntry {
  readonly resource: string;
  handle(payload: unknown): unknown;
}

interface Ledger {
  readonly failed: Set<MountedUnit>;
  readonly failures: UnitFailure[];
}

export function failureReasonOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : String(error);
}

export interface PlanFailureSinks {
  readonly note: (unit: string, reason: string) => void;
  readonly warn: (message: string) => void;
}

export function applyPlanFailures(failures: readonly UnitFailure[], sinks: PlanFailureSinks): void {
  for (const failure of failures) {
    sinks.note(failure.id, failure.reason);
    sinks.warn(`[dsh-workbench] ${failure.id} 套件起不来，已摘掉它这一份：${failure.reason}`);
  }
}

function fail(ledger: Ledger, item: MountedUnit, reason: string): void {
  ledger.failed.add(item);
  ledger.failures.push({ id: item.host.manifest.id, reason });
}

function collectRoutes(
  mounted: readonly MountedUnit[],
  ledger: Ledger,
): { routes: RouteTable; owners: Map<string, string>; routesOfUnit: Map<string, string[]> } {
  const routes: RouteTable = {};
  const owner = new Map<string, string>();
  const routesOfUnit = new Map<string, string[]>();
  for (const item of mounted) {
    if (ledger.failed.has(item)) continue;
    const unit = item.host.manifest.id;
    const accepted: Array<[string, RouteTable[string]]> = [];
    let problem: string | undefined;
    for (const [key, handler] of Object.entries(item.result.routes)) {
      if (key !== unit && !key.startsWith(`${unit}/`)) {
        problem =
          `路由名要住在自己那一格的命名空间里（${unit} 或 ${unit}/…）：${key} 不属于 ${unit} —— ` +
          `装 / 升 / 卸时点名不到它，那个模块的数据会停在旧值`;
        break;
      }
      const previous = owner.get(key);
      if (previous !== undefined) {
        problem = `路由名冲突：${key} 由套件 ${previous} 与 ${unit} 同时声明`;
        break;
      }
      accepted.push([key, handler]);
    }
    if (problem !== undefined) {
      fail(ledger, item, problem);
      continue;
    }
    for (const [key, handler] of accepted) {
      owner.set(key, unit);
      routes[key] = handler;
      const own = routesOfUnit.get(unit);
      if (own === undefined) routesOfUnit.set(unit, [key]);
      else own.push(key);
    }
  }
  return { routes, owners: owner, routesOfUnit };
}

function collectNamed(
  mounted: readonly MountedUnit[],
  ledger: Ledger,
  pickMany: (item: MountedUnit) => ReadonlyArray<NamedEntry>,
  label: string,
): Array<NamedEntry & { readonly unit: string }> {
  const owner = new Map<string, string>();
  const out: Array<NamedEntry & { readonly unit: string }> = [];
  for (const item of mounted) {
    if (ledger.failed.has(item)) continue;
    const unit = item.host.manifest.id;
    const entries = pickMany(item);
    if (entries.length === 0) continue;
    const clash = entries.find((entry) => owner.has(entry.resource));
    if (clash !== undefined) {
      fail(ledger, item, `${label}名冲突：${clash.resource} 由套件 ${owner.get(clash.resource)} 与 ${unit} 同时声明`);
      continue;
    }
    for (const entry of entries) {
      owner.set(entry.resource, unit);
      out.push({ ...entry, unit });
    }
  }
  return out;
}

function collectContextRenderers(
  mounted: readonly MountedUnit[],
  ledger: Ledger,
): ReadonlyMap<string, ContextRenderer> {
  const table = new Map<string, ContextRenderer>();
  const owner = new Map<string, string>();
  for (const item of mounted) {
    if (ledger.failed.has(item)) continue;
    const unit = item.host.manifest.id;
    const context = item.result.context;
    if (context === undefined) continue;
    const clash = context.kinds.find((kind) => owner.has(kind));
    if (clash !== undefined) {
      fail(ledger, item, `对话引用的 kind 冲突：${clash} 由套件 ${owner.get(clash)} 与 ${unit} 同时认领`);
      continue;
    }
    for (const kind of context.kinds) {
      owner.set(kind, unit);
      table.set(kind, (ref) => context.render(ref));
    }
  }
  return table;
}

function pickProvider<T>(
  mounted: readonly MountedUnit[],
  ledger: Ledger,
  pick: (item: MountedUnit) => T | undefined,
  label: string,
): T | undefined {
  let chosen: T | undefined;
  let chosenBy: string | undefined;
  for (const item of mounted) {
    if (ledger.failed.has(item)) continue;
    const value = pick(item);
    if (value === undefined) continue;
    if (chosen === undefined) {
      chosen = value;
      chosenBy = item.host.manifest.id;
      continue;
    }
    fail(ledger, item, `${label}只能有一个提供者，现在是：${chosenBy}、${item.host.manifest.id}`);
  }
  return chosen;
}

function collectWarmReads(mounted: readonly MountedUnit[]): () => readonly (readonly string[])[] {
  const declarations = mounted
    .map((item) => item.result.warmReads)
    .filter((declare): declare is () => readonly (readonly string[])[] => declare !== undefined);
  return () => {
    const seen = new Set<string>();
    const reads: (readonly string[])[] = [];
    for (const read of declarations.flatMap((declare) => declare())) {
      const key = read.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      reads.push(read);
    }
    return reads;
  };
}

function declaredEnvOf(manifest: UnitManifest): Readonly<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const need of manifest.needs ?? []) {
    if (need.kind === 'env') out[need.name] = process.env[need.name];
  }
  return out;
}

export function mountUnits(
  units: readonly HostUnit[],
  deps: {
    ctx: DshHostContext;
    logger?: { info?(m: string): void; warn?(m: string): void } | undefined;
    manifests: () => readonly UnitManifest[];
    ownedUnits?: () => readonly string[];
    installable?: () => readonly string[];
    data?: DataReader;
    libs?: UnitMountDeps['libs'];
    git?: UnitMountDeps['git'];
    commands?: UnitMountDeps['commands'];
    probe?: UnitMountDeps['probe'];
    store?: UnitMountDeps['store'];
    values?: UnitMountDeps['values'];
    longTasks?:
      | {
          readonly scope: string;
          readonly bump: (facts: readonly string[]) => void;
          readonly notify?: ((change: LongTaskChange<LongTaskBase>) => void) | undefined;
        }
      | undefined;
    longTaskRuns?: Map<string, LongTaskRegistry<LongTaskBase>> | undefined;
  },
): UnitsPlan {
  const store = deps.store ?? createWorkspaceStore({ root: null });
  const missingData = async () => ({
    ok: false as const,
    error: { code: 'invalid-request' as const, message: '没有注入 DataReader：模块只能走 deps.data 读数据' },
  });
  const hostKit = createHostKit();
  const data: DataReader = deps.data ?? {
    read: missingData,
    request: missingData,
    requestMany: async (_recipe, calls) => {
      const out: Record<string, Awaited<ReturnType<typeof missingData>>> = {};
      for (const name of Object.keys(calls)) out[name] = await missingData();
      return out;
    },
    submit: missingData,
  };
  const ownedUnits = deps.ownedUnits ?? (() => []);
  const mounted: MountedUnit[] = [];
  const declaredNotes = new Set<string>();
  const skipped: Array<{ id: string; missing: readonly string[] }> = [];
  const longTaskDisposers = new Map<MountedUnit, () => void>();
  const longTaskRuns = deps.longTaskRuns ?? new Map<string, LongTaskRegistry<LongTaskBase>>();
  const ledger: Ledger = { failed: new Set(), failures: [] };

  for (const host of units) {
    const readiness = unitReadiness(host.manifest, (dep) => deps.ctx.get(dep));
    if (!readiness.canMount) {
      skipped.push({ id: host.manifest.id, missing: readiness.missingHard });
      continue;
    }
    const unit = host.manifest.id;
    const tools = deps.ctx.get<DshToolRegistry>('tools');
    const toolJournal: Array<() => void> = [];
    const mountCtx = tools === undefined ? deps.ctx : scopedMountCtx(deps.ctx, tools, toolJournal, declaredNotes);
    const longTasks =
      deps.longTasks === undefined
        ? undefined
        : createLongTaskHost({
            scope: deps.longTasks.scope,
            unit,
            bump: deps.longTasks.bump,
            ...(deps.longTasks.notify === undefined ? {} : { notify: deps.longTasks.notify }),
          });
    let result: UnitMountResult;
    try {
      result = host.face.mount({
        manifest: host.manifest,
        ctx: mountCtx,
        logger: deps.logger,
        manifests: deps.manifests,
        ownedUnits,
        ...(deps.installable === undefined ? {} : { installable: deps.installable }),
        data,
        ...hostKit,
        env: declaredEnvOf(host.manifest),
        ...(deps.libs === undefined ? {} : { libs: deps.libs }),
        ...(deps.git === undefined ? {} : { git: deps.git }),
        ...(deps.commands === undefined ? {} : { commands: deps.commands }),
        ...(deps.probe === undefined ? {} : { probe: deps.probe }),
        ...(deps.values === undefined ? {} : { values: deps.values }),
        ...(longTasks === undefined ? {} : { longTasks: longTasks.host }),
        longTaskRuns: () => longTaskRuns,
        store,
      });
    } catch (error) {
      for (const dispose of toolJournal.splice(0)) dispose();
      longTasks?.dispose();
      ledger.failures.push({ id: unit, reason: failureReasonOf(error) });
      continue;
    }
    const item: MountedUnit = {
      host,
      readiness,
      result: withRunsRoute(result, unit),
      rollbackTools: () => {
        for (const dispose of toolJournal.splice(0)) dispose();
      },
    };
    mounted.push(item);
    if (longTasks !== undefined) longTaskDisposers.set(item, longTasks.dispose);
    const runs = item.result.longTasks;
    if (runs !== undefined) longTaskRuns.set(unit, runs);
  }

  const collected = collectRoutes(mounted, ledger);
  const prefs = collectNamed(mounted, ledger, (item) => (item.result.prefs === undefined ? [] : [item.result.prefs]), '偏好资源');
  const actions = collectNamed(mounted, ledger, (item) => item.result.actions ?? [], '动作资源');
  const owners = new Map(collected.owners);
  for (const entry of [...prefs, ...actions]) owners.set(entry.resource, entry.unit);
  const factsOf = new Map<string, (call: UnitCall) => readonly string[] | undefined>();
  for (const item of mounted) {
    if (ledger.failed.has(item)) continue;
    const declare = item.result.factsOf;
    if (declare !== undefined) factsOf.set(item.host.manifest.id, declare);
  }

  const gate = pickProvider(mounted, ledger, (item) => item.result.gate, '启停闸门');
  const provision = pickProvider(mounted, ledger, (item) => item.result.provision, '机器供给');
  const contextRenderers = collectContextRenderers(mounted, ledger);

  const alive = mounted.filter((item) => !ledger.failed.has(item));
  for (const item of mounted) {
    if (!ledger.failed.has(item)) continue;
    longTaskDisposers.get(item)?.();
    longTaskDisposers.delete(item);
    const runs = item.result.longTasks;
    if (runs !== undefined && longTaskRuns.get(item.host.manifest.id) === runs) {
      longTaskRuns.delete(item.host.manifest.id);
    }
  }

  return {
    mounted: alive,
    routes: collected.routes,
    owners,
    routesOfUnit: collected.routesOfUnit,
    factsOf,
    gate,
    prefs,
    actions,
    provision,
    contextRenderers,
    skipped,
    failed: ledger.failures,
    warmReads: collectWarmReads(alive),
    declaredNotes,
    disposeLongTasks: () => {
      for (const dispose of [...longTaskDisposers.values()]) dispose();
      longTaskDisposers.clear();
      for (const item of mounted) {
        const runs = item.result.longTasks;
        if (runs !== undefined && longTaskRuns.get(item.host.manifest.id) === runs) {
          longTaskRuns.delete(item.host.manifest.id);
        }
      }
    },
  };
}
