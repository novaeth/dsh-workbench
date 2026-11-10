import type { DshHostContext, DshWorkspaceRegistry, UnitManifest } from '@dsh-workbench/shared';
import { provideWorkbenchSeam } from '@/shared/api/host/workbench-seam';
import { holdHostLock } from '@/shared/api/host/host-lock';
import { bootChores } from '@/shared/api/host/boot-chores';
import { bootOkAction } from '@/shared/api/host/boot-ok';
import { provideGitProcessSeam } from '@/shared/api/host/git-process';
import { shippedAdapterSet } from '@/shared/api/host/shipped-adapter-set';
import { createHostRoutes } from '@/shared/api/host/host-routes';
import { assembleHostUnits } from '@/app/units/host';
import { createPostChannels } from '@/shared/api/host/post-channels';
import { takeHeldNotices, type AgentsLookup } from '@/shared/api/host/diy-debug-act';
import { registerDiyActs } from '@/shared/api/host/diy-acts';
import { dshHome, hostSurface, runningVersionOf, workbenchRoot } from '@dsh-workbench/shared/host';
import {
  capabilityHandler,
  registerApi,
  registerPanelState,
  type PostWrite,
  type RouteTable,
} from '@dsh-workbench/shared/host';
import { PANEL_STATE_SERVICE, createFactLog, createPanelStateStore, toolUnits, wroteNow } from '@dsh-workbench/shared/host';

import { createMcpScope } from '@/shared/api/host/pack-scope';
import { mountWorkbenchSettings, workbenchSettingsAction } from '@/shared/api/host/workbench-settings';
import { basename } from 'node:path';
import { registerFactStream } from '@/shared/api/host/events';
import { WORKSHOP_TITLE } from '@/kernel/contract/diy';
import { workshopPathOf } from '@/shared/api/host/diy';
import { WORKBENCH_ADAPTERS, needsOf, resolveAdapterSet, type AdapterSet, type NeedProbeInput, type PluginRowsSource, type PluginUnitsPort, type UnitCapability, type WorkbenchConfig } from '@dsh-workbench/shared/host';
import { UNIT_MANIFESTS_ROUTE } from '@/kernel/contract/unit-manifests';
import { LONG_TASKS_ROUTE } from '@/kernel/contract/long-tasks';
import { liveLongTaskRows } from '@/shared/api/host/long-tasks';
import { createContextInjector, installContextInject, type ContextRenderer } from '@/shared/api/host/context-inject';
import type { LongTaskBase, LongTaskRegistry, UnitCall, UnitMountResult, ToolScopeContext } from '@dsh-workbench/shared/host';
import { applyPlanFailures, declaredNotesOf, mountUnits, failureReasonOf, type UnitsPlan } from '@/kernel/host/mount-units';
import {
  createUnitRegistry,
  installableUnitsOf,
  type HostUnit,
} from '@/kernel/host/unit-registry';
import { bindRosterFacts } from '@/shared/api/host/unit-roster-facts';
import { createWorkspaceStore, withLibRunners } from '@dsh-workbench/shared/host';
import { CONFIG_SYNC_ROUTE } from '@/kernel/contract/config-sync';
import { PROFILE_CREATE_ROUTE } from '@/kernel/contract/profile-create';
import { SIDEBAR_EDITION_ROUTE } from '@/kernel/contract/sidebar-edition';
import { sidebarEditionAction, sidebarEditionHandler } from '@/shared/api/host/sidebar-edition';
import { createPresetScope } from '@/shared/api/host/preset-scope';
import { createClosedReasonOf } from '@/shared/api/host/closed-tool-gate';
import { registerCapabilitySkill } from '@/shared/api/host/capability-skill';
import { createValueHandoff } from '@dsh-workbench/shared/host';
import { PANELS_SERVICE, PLUGIN_ID, UNITS_SERVICE } from '@dsh-workbench/shared/host';
import { asArgs, warn } from '../shared/api/host/host-args';
import { createApprovalGate } from '@/shared/api/host/approval-gate';
import { registerBootThemeGuard } from '@/shared/api/host/boot-theme-guard';
import { registerDiyPreset } from '@/shared/api/host/diy-preset';
import { notifyLongTaskChange } from '@/shared/api/host/long-task-notice';
export const name = 'dsh-workbench';
interface ReleasedLookup { isReleased(id: string): boolean }
export const inject = ['webServer'];
export async function apply(ctx: DshHostContext, config?: WorkbenchConfig): Promise<void> {
  const seam = provideWorkbenchSeam(ctx);
  if (seam !== undefined) provideGitProcessSeam(seam);
  registerBootThemeGuard(ctx);
  registerDiyPreset(ctx);
  const facts = createFactLog();
  const values = createValueHandoff();
  const panelState = createPanelStateStore();
  const resolved = await resolveAdapterSet(ctx, config?.adapterSet, () => shippedAdapterSet(ctx));
  const adapters: AdapterSet = resolved.set;
  const loaded = resolved.load;
  adapters.runtime.seed(ctx, { corePackageUrl: import.meta.url, log: (message) => warn(ctx, message) });
  if (loaded.ok) {
    ctx.logger?.info?.(`[dsh-workbench] 适配器集合：${adapters.id}@${adapters.version}（${loaded.spec}）`);
  } else if (loaded.failure !== 'not-configured') {
    ctx.logger?.warn?.(`[dsh-workbench] 适配器集合没生效（${loaded.failure}）：${loaded.detail}；先用默认集合`);
  }
  ctx.provide(WORKBENCH_ADAPTERS, adapters);
  const runtimeCommands = adapters.runtime.commands(ctx);
  const libRunners =
    adapters.libs === undefined
      ? undefined
      : withLibRunners(adapters.libs, adapters.runtime.runners(ctx, adapters.data), ctx.logger);
  const routes: RouteTable = createHostRoutes({
    ctx,
    facts,
    runtimes: adapters.runtime.health(ctx),
    running: runningVersionOf(import.meta.url),
    profile: adapters.profile,
  });
  const baseHealth = routes.health;
  const adapterFailure = loaded.ok || loaded.failure === 'not-configured' ? null : loaded.failure;
  const adapterSpec = loaded.spec ?? null;
  const capabilities = adapters.runtime.capabilities(ctx);
  const runtimeProfile = adapters.runtime.profile?.(ctx) ?? null;
  const runtimeCheck = adapters.runtime.check;
  const profileDir = adapters.profile.dirOf(ctx);
  bootChores({ ctx, supply: adapters.modules, home: dshHome(), profileDir });
  const surface = hostSurface({ profile: profileDir ?? undefined });
  routes.health = async (search) => ({
    ...((await baseHealth?.(search)) as Record<string, unknown>),
    capabilities,
    runtimeProfile, surface,
    adapterSet: {
      configured: adapterSpec,
      active: adapters.id,
      id: adapters.id,
      version: adapters.version,
      usesDefaults: resolved.usedDefaults,
      failure: adapterFailure,
      detail: adapterFailure === null ? null : !loaded.ok ? loaded.detail : null,
      messageKey: adapterFailure === null ? null : `adapterSet.${adapterFailure}`,
      messageParams: { spec: adapterSpec ?? '' },
    },
  });
  const renderers = new Map<string, ContextRenderer>();
  const packageRoot = adapters.runtime.packageRoot(import.meta.url);
  const reconcileProfile = async (): Promise<boolean> => {
    const hmr = ctx.get<{
      runExclusive?: <T>(operation: () => Promise<T>) => Promise<T>;
      reconcileProfile?: () => Promise<unknown>;
    }>('hmr');
    if (hmr?.runExclusive === undefined || hmr.reconcileProfile === undefined) return false;
    await hmr.runExclusive(() => hmr.reconcileProfile!());
    return true;
  };
  const sidebarReconcile = async (): Promise<void> => {
    await reconcileProfile();
  };
  const configSync = {
    home: dshHome(),
    self: profileDir === null ? '' : basename(profileDir),
    profileDir,
    reconcile: reconcileProfile,
  };
  const profileCreate = { home: dshHome(), self: profileDir === null ? '' : basename(profileDir), packageRoot };
  routes[CONFIG_SYNC_ROUTE] = adapters.actions.configSyncHandler(configSync);
  routes[PROFILE_CREATE_ROUTE] = adapters.actions.profileCreateHandler(profileCreate);
  routes[SIDEBAR_EDITION_ROUTE] = sidebarEditionHandler({ profileDir });
  const units = createUnitRegistry({
    declarationOf: adapters.plugins.declarationLookup(profileDir),
    logger: ctx.logger,
  });
  ctx.provide(UNITS_SERVICE, units);
  ctx.provide(PANEL_STATE_SERVICE, panelState);
  routes[UNIT_MANIFESTS_ROUTE] = () => ({
    ok: true,
    manifests: units.manifests(),
    installable: installableUnitsOf(units),
  });
  assembleHostUnits(units);
  ctx.inject(['workspaceRegistry'], (scoped) => {
    const registry = scoped.get<DshWorkspaceRegistry>('workspaceRegistry');
    const workshop = workshopPathOf(scoped);
    if (registry === undefined || workshop === null) return;
    void registry.create(workshop, WORKSHOP_TITLE).catch((error: unknown) => {
      ctx.logger?.warn?.(`dsh-workbench: 工坊没能登记成工作区 —— ${String(error)}`);
    });
  });
  const liveManifests = (): readonly UnitManifest[] => units.manifests();
  const manifestOf = (unit: string): UnitManifest | undefined =>
    liveManifests().find((manifest) => manifest.id === unit);
  const hasEnvNeeds = (manifest: UnitManifest): boolean => needsOf(manifest).length > 0;
  const declaredNow = (): readonly UnitManifest[] => liveManifests().filter(hasEnvNeeds);
  const probeInput = (manifest: UnitManifest): NeedProbeInput => ({
    unit: manifest.id,
    needs: needsOf(manifest),
  });
  const releasedOf = (unit: string): boolean =>
    ctx.get<ReleasedLookup>(PANELS_SERVICE)?.isReleased(unit) ?? false;
  const probeOne = async (unit: string, force = false): Promise<UnitCapability | undefined> => {
    if (seam === undefined) return undefined;
    const manifest = manifestOf(unit);
    if (manifest === undefined || !hasEnvNeeds(manifest)) return undefined;
    const common = { seam, runtimeCommands, force };
    const found = (await adapters.probe.probeUnits({ ...common, units: declaredNow().map(probeInput) })).find(
      (row) => row.unit === unit,
    );
    return found === undefined ? undefined : { ...found, released: releasedOf(unit) };
  };
  const store = createWorkspaceStore({ logger: ctx.logger });
  const unitsOfTool = (): ReturnType<typeof toolUnits> => toolUnits(liveManifests());
  const settings = mountWorkbenchSettings({ ctx, routes, root: workbenchRoot() });
  const mcpScope = createMcpScope({ ctx, reapply: () => toolScope.reapply(), settings });
  const toolScope = createPresetScope({
    ctx,
    deniedTools: (context) => deniedNow(context),
    extraDenied: (assembly, context) => mcpScope.extraDenied(assembly, context),
    logger: ctx.logger,
  });
  ctx.effect(
    () => units.subscribe(() => toolScope.reapply()),
    `${PLUGIN_ID}: 单元清单变了就把工具面重新收一遍`,
  );
  const pluginTools: PluginUnitsPort | undefined =
    seam === undefined
      ? undefined
      : adapters.plugins.createUnits({
          registry: units,
          rows: () => ctx.get<PluginRowsSource>(PANELS_SERVICE)?.listPlugins(null) ?? [],
          declared: (plugin) => adapters.probe.declaredPluginCommands(profileDir).get(plugin) ?? new Set<string>(),
          toolNames: () => new Set(unitsOfTool().keys()),
          logger: ctx.logger,
        });
  interface Mounted {
    readonly result: UnitMountResult;
    readonly plan: UnitsPlan;
    readonly toolDisposers: readonly (() => void)[];
    readonly gateOff: (() => void) | undefined;
  }
  const mounted = new Map<string, Mounted>();
  const mountFailures = new Map<string, { readonly reason: string; readonly host: HostUnit }>();
  const longTaskRuns = new Map<string, LongTaskRegistry<LongTaskBase>>();
  const factsOfMap = new Map<string, (call: UnitCall) => readonly string[] | undefined>();
  const routesOfUnitMap = new Map<string, readonly string[]>();
  const ownersMap = new Map<string, string>();
  routes[LONG_TASKS_ROUTE] = () => ({ ok: true, runs: liveLongTaskRows(longTaskRuns) });
  const factsOfUnit = (unit: string): readonly string[] => [...(routesOfUnitMap.get(unit) ?? []), 'capability'];
  const callFacts = (unit: string, call: UnitCall): readonly string[] =>
    factsOfMap.get(unit)?.(call) ?? factsOfUnit(unit);
  const deniedNow = (context: ToolScopeContext): readonly string[] => [
    ...new Set([
      ...[...mounted.values()].flatMap((item) => item.plan.gate?.deniedTools(context) ?? []),
      ...mcpScope.denied(context),
    ]),
  ];
  const closedReasonOf = createClosedReasonOf({
    ctx,
    gates: () => [...mounted.values()].map((item) => item.plan.gate),
  });
  const declaredNoteTools = (): ReadonlySet<string> =>
    declaredNotesOf([...mounted.values()].map((item) => item.plan));
  const wrote = (resource: string, write: PostWrite): void => {
    const unit = ownersMap.get(resource);
    if (unit !== undefined) {
      facts.bump(callFacts(unit, { source: resource, args: asArgs(write.args), result: write.result }));
    }
  };
  const postChannels = createPostChannels({
    ctx,
    mounted,
    facts,
    shellActions: [
      adapters.actions.configSyncAction(configSync),
      adapters.actions.profileCreateAction(profileCreate),
      sidebarEditionAction({ profileDir, reconcile: sidebarReconcile }),
      bootOkAction({ version: () => runningVersionOf(import.meta.url) ?? '' }),
      workbenchSettingsAction(settings),
    ],
  });
  function unmountUnit(id: string): void {
    const item = mounted.get(id);
    if (item === undefined) return;
    mounted.delete(id);
    mountFailures.delete(id);
    units.recovered(id);
    for (const dispose of item.toolDisposers) dispose?.();
    item.gateOff?.();
    item.plan.disposeLongTasks();
    for (const route of Object.keys(item.plan.routes)) delete routes[route];
    for (const kind of item.plan.contextRenderers.keys()) renderers.delete(kind);
    for (const unit of item.plan.factsOf.keys()) factsOfMap.delete(unit);
    for (const unit of item.plan.routesOfUnit.keys()) routesOfUnitMap.delete(unit);
    for (const resource of item.plan.owners.keys()) ownersMap.delete(resource);
  }
  function mountUnit(host: HostUnit): void {
    const id = host.unit;
    let one: UnitsPlan;
    try {
      one = mountUnits([host], {
        ctx,
        logger: ctx.logger,
        manifests: liveManifests,
        ownedUnits: () => units.owned(),
        installable: () => installableUnitsOf(units),
        store,
        data: adapters.data,
        libs: libRunners,
        git: adapters.git,
        commands: adapters.commands,
        probe: (unit, options) => probeOne(unit, options?.force ?? false),
        values, surface,
        ...(seam === undefined ? {} : { seam }),
        longTasks: {
          scope: process.env['DSH_HOME'] ?? '',
          bump: (names) => facts.bump([...names, LONG_TASKS_ROUTE]),
          notify: (change) => notifyLongTaskChange(ctx.get<AgentsLookup>('agents'), host.unit, change),
        },
        longTaskRuns,
      });
    } catch (error) {
      mountFailures.set(id, { reason: failureReasonOf(error), host });
      units.fail(id, failureReasonOf(error));
      ctx.logger?.warn?.(`[dsh-workbench] ${id} 套件起不来（装配期）：${failureReasonOf(error)}`);
      return;
    }
    for (const item of one.skipped) {
      ctx.logger?.warn?.(`[dsh-workbench] ${item.id} 套件缺硬依赖，跳过：${item.missing.join(', ')}`);
    }
    applyPlanFailures(one.failed, {
      note: (unit, reason) => {
        mountFailures.set(unit, { reason, host });
        units.fail(unit, reason);
      },
      warn: (message) => ctx.logger?.warn?.(message),
    });
    const slot = one.mounted[0];
    if (slot === undefined) {
      one.disposeLongTasks();
      return;
    }
    if (slot.readiness.missingSoft.length > 0) {
      ctx.logger?.warn?.(
        `[dsh-workbench] ${host.unit} 套件降级：缺 ${slot.readiness.missingSoft.join(', ')}`,
      );
    }
    const added: string[] = [];
    try {
      Object.assign(routes, one.routes);
      added.push(...Object.keys(one.routes));
      for (const [kind, render] of one.contextRenderers) renderers.set(kind, render);
      for (const [unit, fn] of one.factsOf) factsOfMap.set(unit, fn);
      for (const [unit, list] of one.routesOfUnit) routesOfUnitMap.set(unit, list);
      for (const [resource, unit] of one.owners) ownersMap.set(resource, unit);
      mounted.set(host.unit, {
        result: slot.result,
        plan: one,
        toolDisposers: slot.result.registerTools(),
        gateOff: one.gate?.subscribe(() => toolScope.reapply()),
      });
      mountFailures.delete(id);
      units.recovered(id);
    } catch (error) {
      slot.rollbackTools();
      for (const route of added) delete routes[route];
      for (const kind of one.contextRenderers.keys()) renderers.delete(kind);
      for (const unit of one.factsOf.keys()) factsOfMap.delete(unit);
      for (const unit of one.routesOfUnit.keys()) routesOfUnitMap.delete(unit);
      for (const [resource, unit] of one.owners) {
        if (ownersMap.get(resource) === unit) ownersMap.delete(resource);
      }
      one.disposeLongTasks();
      mountFailures.set(id, { reason: failureReasonOf(error), host });
      units.fail(id, failureReasonOf(error));
      ctx.logger?.warn?.(`[dsh-workbench] ${id} 套件起不来（注册期）：${failureReasonOf(error)}`);
    }
  }
  function rebindPost(): void {
    postChannels.rebind(wrote);
  }
  function sync(): void {
    const present = new Set(units.all().map((one) => one.unit));
    for (const id of [...mounted.keys()]) {
      if (!present.has(id)) unmountUnit(id);
    }
    for (const id of [...mountFailures.keys()]) {
      if (!present.has(id)) {
        mountFailures.delete(id);
        units.recovered(id);
      }
    }
    for (const host of units.all()) {
      if (mounted.has(host.unit)) continue;
      const already = mountFailures.get(host.unit);
      if (already !== undefined && already.host === host) continue;
      mountUnit(host);
    }
    rebindPost();
  }
  if (seam === undefined) {
    ctx.logger?.warn?.('[dsh-workbench] 没有 shell 服务：需要执行缝的套件会降级');
  } else {
    adapters.probe.registerPreflight({
      routes,
      ctx,
      seam,
      runtimeCommands,
      runtimeCapabilities: capabilities,
      ...(runtimeCheck === undefined ? {} : { runtimeCheck: () => runtimeCheck(ctx) }),
      ...(runtimeProfile === null ? {} : { runtimeLabel: runtimeProfile.label }),
      warmReads: () => [...mounted.values()].flatMap((item) => item.plan.warmReads()),
    });
    routes.capability = capabilityHandler(async (unit, force) => {
      if (unit === undefined) {
        const common = {
          seam,
          runtimeCommands,
          force,
        };
        const found = await adapters.probe.probeUnits({ ...common, units: declaredNow().map(probeInput) });
        return { units: found.map((item) => ({ ...item, released: releasedOf(item.unit) })) };
      }
      const failure = mountFailures.get(unit);
      if (failure !== undefined) {
        return { unit, status: 'failed', required: [], missing: [], detail: failure.reason };
      }
      return probeOne(unit, force);
    });
  }

  sync();

  if (pluginTools !== undefined) {
    const health = routes.health;
    routes.health = async (search) => ({
      ...((await health?.(search)) as Record<string, unknown>),
      pluginTools: pluginTools.report(),
    });
    ctx.effect(() => {
      void pluginTools.refresh().catch((error: unknown) => {
        warn(ctx, `探插件命令面时抛了错：${String(error)}`);
      });
      return () => pluginTools.dispose();
    }, `${PLUGIN_ID}: 已装且上板的插件各合成一个单元（工具面照旧由面板那道闸收窄）`);
    ctx.effect(() => {
      const panels = ctx.get<PluginRowsSource & { subscribe?(listener: () => void): () => void }>(
        PANELS_SERVICE,
      );
      const off = panels?.subscribe?.(() => pluginTools.touch());
      return () => off?.();
    }, `${PLUGIN_ID}: 面板配置一动就重探插件命令面（装上 / 收起都在那一条链上）`);
  }

  ctx.effect(() => () => {
    for (const id of [...mounted.keys()]) unmountUnit(id);
    postChannels.dispose();
  }, `${PLUGIN_ID}: 卸载时把单元摘干净`);
  ctx.effect(() => units.subscribe(sync), `${PLUGIN_ID}: 注册表变了就增删（装/卸一个模块 = 挂/卸它的面）`);
  ctx.effect(() => holdHostLock((message) => warn(ctx, message)), `${PLUGIN_ID}: 宿主在跑就留一枚锁，自更新等它退了才换包`);
  ctx.effect(
    () => bindRosterFacts({ units, bump: (names) => facts.bump(names) }),
    `${PLUGIN_ID}: 花名册变了就把清单那条事实记一笔（浏览器据此重读，不用刷新页面）`,
  );

  ctx.effect(() => {
    const off = ctx.on?.('tools/post-execute', (exec, result, next) => {
      const name = exec?.name === undefined ? undefined : String(exec.name);
      const tool = name === undefined ? undefined : unitsOfTool().get(name);
      if (tool !== undefined && name !== undefined) {
        const call: UnitCall = { source: name, args: asArgs(exec?.arguments), result };
        const declared = factsOfMap.get(tool.unit)?.(call);
        if (declared !== undefined) {
          if (declared.length > 0) facts.bump(declared);
        } else if (tool.writes && wroteNow(result) !== false) {
          facts.bump(factsOfUnit(tool.unit));
        }
      }
      return next();
    });
    return () => off?.();
  }, `${PLUGIN_ID}: 事实归属（读工具与写工具同一处声明）`);

  ctx.effect(() => {
    const off = ctx.on?.('agent/created', (payload) => {
      toolScope.apply(payload?.agent);
      registerCapabilitySkill(ctx, payload?.agent);
      pluginTools?.touch();
    });
    return () => off?.();
  }, `${PLUGIN_ID}: agent 的工具面按工作区收窄（创建时）`);
  ctx.effect(() => {
    const off = ctx.on?.('system-prompt/assemble', async (_assembly, context, next) => {
      pluginTools?.touch();
      const resolved = await next();
      return toolScope.narrow(resolved, context?.agent ?? context?.scope);
    });
    return () => off?.();
  }, `${PLUGIN_ID}: 打包提示时就把收起的工具从清单里去掉（不靠限制的生效时机）`);
  ctx.effect(() => () => toolScope.disposeAll(), `${PLUGIN_ID}: 卸载时撤销工具面限制`);

  ctx.effect(() => {
    const off = ctx.on?.(
      'tools/pre-execute',
      createApprovalGate({
        ctx,
        toolOf: (name) => unitsOfTool().get(name),
        faceOf: (unit) => mounted.get(unit)?.result,
        declaredNotes: declaredNoteTools,
        deniedReasonOf: closedReasonOf,
      }),
    );
    return () => off?.();
  }, `${PLUGIN_ID}: 写操作的用户审批`);

  const injector = createContextInjector({ logger: ctx.logger, renderers });
  ctx.effect(
    () =>
      installContextInject({
        ctx,
        injector,
        apply: (agent) => toolScope.apply(agent),
        held: (agentId) => takeHeldNotices(agentId),
      }),
    `${PLUGIN_ID}: 对话引用注入`,
  );
  ctx.effect(() => registerFactStream(ctx, facts), `${PLUGIN_ID}: 变更流`);
  ctx.effect(() => registerPanelState(ctx, panelState), `${PLUGIN_ID}: 面板运行态上报（浏览器半侧报自己的取数与渲染收尾）`);
  ctx.effect(() => registerDiyActs(ctx, { bump: (names) => facts.bump(names) }), `${PLUGIN_ID}: DIY 的两族键（用户按的）`);
  ctx.effect(() => registerApi(ctx, routes), `${PLUGIN_ID}: HTTP 投影`);
}
