import type { UnitManifest } from '@dsh-workbench/shared';
import type { DshHostContext, LongTaskBase, LongTaskRegistry, ProfileReload, RecordStore, UnitOwnedFace } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_SERVICE, DIY_RECORD_SERVICE, MCP_TOOLS_SERVICE, TOOLBOX_SERVICE, adaptersOf, createDebugStore, createLongTaskRegistry, createRecordStore, supplyNeedsOf, PANELS_SERVICE, dshHome, reconcileProfileRows, seamOf, supplyPortOf, workbenchRoot } from '@dsh-workbench/shared/host';
import type { McpToolsPort, ToolboxPort, ToolScopeContext } from '@dsh-workbench/shared/host';
import { basename, join } from 'node:path';
import { registeredWorkspacePathOf } from '@/shared/api/host/workspace-root';
import { hostSurface } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { panelsApprovalFor } from './model/approval-policy';
import type { PanelApprovalProbes } from './model/approval-prechecks';
import { resolveScope } from './model/config';
import { registerLongTaskTools } from './model/long-task-tools';
import { registerDiyTools } from './model/diy-tools';
import { unitsOf } from './model/diy-context';
import { foreignDomainText } from './model/diy-record';
import { readDesignOfModule } from '@/shared/api/host/diy-modules';
import { inferredAuthorOf, publishPreviewOf } from '@/shared/api/host/diy-publish-preview';
import { stopObservers, withObserverCleanup } from './model/diy-observers';
import { diyDebugRoutes } from './model/diy-debug-routes';
import { diyRecordRoutes } from './model/diy-record-routes';
import { registerRecordTools, type RecordFlowPort } from './model/diy-record-tools';
import type { DiyFlowRuns } from './model/flow/runs';
import { releaseQuietly } from './model/diy-record';
import { createMarketService } from './model/market';
import { createMarketDiscover } from './model/market-discover';
import { marketDiscoverRoutes } from './model/market-discover-routes';
import { installedFromIndexes, marketInstalledRoutes, transportOfSpec } from './model/market-installed';
import { dependencyReader } from '@/shared/api/host/profile-dependencies';
import { probeGitAddressCached } from '@/shared/api/host/git-probe';
import { markSourceReadOnly, marketSourcesAction, marketSourcesRoutes } from './model/market-sources-act';
import { publishPreviewRoutes } from './model/publish-preview-routes';
import { createPublishPreflight } from './model/publish-preflight';
import { createMarketIndexReader } from '@/shared/api/host/market-index-fetch';
import { createMarketDocReader } from '@/shared/api/host/market-doc';
import { createInstalledPackageReader } from '@/shared/api/host/installed-package';
import { createMarketSourcesStore } from '@/shared/api/host/market-sources-store';
import { createMarketSourceInitializer } from '@/shared/api/host/market-source-init';
import { affectedUnitsOf } from './model/market-dependency';
import { dispatchMarket } from './model/market-dispatch';
import { registerMarketTools } from './model/market-tools';
import { applyPanelsPref, PANELS_PREF_RESOURCE } from './model/prefs';
import { panelsFactsOf } from './model/handoff';
import { createPanelsService } from './model/service';
import { panelRoutes } from './model/routes';
import { WORKBENCH_SETTINGS_SERVICE, type WorkbenchSettingsStore } from '@/shared/api/host/workbench-settings';
import { createPluginLedger } from './model/plugin-ledger';
import { pluginPanelRefs } from './model/plugin-panel';
import { pluginRoutes } from './model/plugin-section';
import { pluginDirOf } from './model/plugin-name';
import { installedPackageRoutes } from './model/installed-package-routes';
import { registerPanelTools } from './model/tools';
import { createToolbox, flowPacksOf } from './model/toolbox';
import { createDshFlowJournal, createFlowHost } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from './model/flow/definitions';
import { BEFORE_FLOW, deniedAtStep } from './model/flow/gate';
import { registerDiyPlanTool } from './model/flow/plan-tool';
import { registerDiyStepTool } from './model/flow/step-tool';
import { createDiyFlowRuns } from './model/flow/runs';
import { diyFlowRoutes } from './model/flow/routes';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { absentScreenReason, diyManageAbsentReason, offBoardReason, packClosedReason } from './model/closed-tool';
import { registerToolboxTools } from './model/toolbox-tools';
import { diagExportAction } from '@/shared/api/host/diag-export-action';
import { registerDiagTools } from './model/diag-tool';
import { registerUnitSkills } from './model/unit-skills';
import type { UnitSkillDeps } from './model/unit-skills';
import { panelsUnit, screenOnlyToolsFor } from './unit';

function recordFlowOf(runs: DiyFlowRuns): RecordFlowPort {
  return {
    flowOf: (session) => {
      const flow = runs.flowOf(session);
      return flow === null ? null : { id: flow.id };
    },
    stepOf: (session) => {
      const step = runs.stepOf(session);
      return step === null ? null : { id: step.id, ...(step.title === undefined ? {} : { title: step.title }) };
    },
    start: (session) => {
      if (runs.flowOf(session) !== null) return;
      runs.start(session, { destination: 'write-record' });
    },
    advance: async (session, value) => {
      await runs.advance(session, value);
    },
    finish: async (session) => {
      await runs.advance(session, { done: true });
    },
    gaps: (session) => {
      const scan = runs.valuesOf(session)['scan'];
      const gaps = typeof scan === 'object' && scan !== null ? (scan as Record<string, unknown>)['gaps'] : undefined;
      return Array.isArray(gaps) ? gaps.filter((one): one is string => typeof one === 'string') : [];
    },
  };
}

export const panelsHost: UnitOwnedFace = {
  unit: panelsUnit.id,
  manifest: panelsUnit,
  mount({ ctx: moduleCtx, logger, manifests, ownedUnits, installable, probe, store, values, longTaskRuns }) {
    const ctx = moduleCtx as unknown as DshHostContext;
    const supply = supplyPortOf(ctx);
    const runtimeLabel = adaptersOf(ctx).runtime.profile?.(ctx)?.label ?? '';
    const runtimeField = supply.pluginRuntimeField?.() ?? '';
    const pluginDir = supply.vendorPluginsDir?.();
    const pluginManifest = supply.pluginManifestFile?.();
    const ledger = createPluginLedger({
      store,
      home: supply.isolatedHome(),
      ...(pluginDir === undefined || pluginManifest === undefined
        ? {}
        : { pluginFiles: { dir: pluginDir, manifest: pluginManifest } }),
    });
    const panels = createPanelsService({
      manifests,
      store,
      owned: ownedUnits,
      plugins: () => pluginPanelRefs(ledger),
      logger,
    });
    ctx.provide(PANELS_SERVICE, panels);
    const visibleUnits = (workspace: string | null): ReadonlySet<string> => {
      const boards = panels.boards(workspace);
      const owned = new Set(ownedUnits());
      return new Set(
        manifests()
          .filter((manifest) => owned.has(manifest.id) || resolveScope({ id: manifest.id, boards }))
          .map((manifest) => manifest.id),
      );
    };
    const diyRuns = createDiyFlowRuns({
      host: createFlowHost(),
      flow: DIY_BOARD_FLOW,
      onEnd: () => {},
      journal: createDshFlowJournal(ctx),
    });
    const toolbox = createToolbox({
      manifests,
      visibleUnits,
      mcp: () => (ctx.get(MCP_TOOLS_SERVICE) as McpToolsPort | undefined)?.servers() ?? [],
      flowDenied: (context) => {
        if (context.preset !== DIY_PRESET_ID || context.session === null) return [];
        const step = diyRuns.stepOf(context.session);
        return [...(step === null ? BEFORE_FLOW : deniedAtStep(step))];
      },
    });
    const toolboxPort: ToolboxPort = {
      packsOf: (session, preset) => toolbox.packsOf(session, preset),
    };
    ctx.provide(TOOLBOX_SERVICE, toolboxPort);
    const offAutoPacks = diyRuns.subscribe((session) => {
        const step = diyRuns.stepOf(session);
        if (step === null) {
          toolbox.clearAuto(session);
          return;
        }
        toolbox.autoOpen(session, flowPacksOf(step.id));
    });
    ctx.effect?.(() => () => offAutoPacks(), 'panels: 流程步自动开 DIY 子包（单调加开，结束收回）');
    const installRuns: LongTaskRegistry<LongTaskBase> = createLongTaskRegistry<LongTaskBase>({
      view: (snapshot) => ({
        title: snapshot.status === 'stopped' ? `${snapshot.target} · 已停止等待（安装可能仍在进行）` : snapshot.target,
        status: snapshot.status,
        step: snapshot.step,
        steps: snapshot.steps,
      }),
      run: ({ payload }) =>
        new Promise<void>((resolve, reject) => {
          (payload as { settle: (error?: unknown) => void }).settle = (error) =>
            error === undefined ? resolve() : reject(error);
        }),
    });
    const debug = withObserverCleanup(createDebugStore(), (workspace) => stopObservers(ctx, workspace), logger);
    ctx.provide(DIY_DEBUG_SERVICE, debug);
    const base = createRecordStore();
    const record: RecordStore = {
      ...base,
      release: (state) => {
        const seamNow = seamOf(ctx);
        if (seamNow === undefined) return Promise.resolve({ tab: false, capture: false });
        return releaseQuietly({
          seam: seamNow,
          command: cliCommandOf(ctx),
          session: BROWSER_RECORD_SESSION,
          url: state.url,
          captureFile: state.captureFile,
        });
      },
    };
    ctx.provide(DIY_RECORD_SERVICE, record);

    const profileDir = supply.profileDirOf(ctx);
    const installedPackages = createInstalledPackageReader({
      profileDir,
      sharedLibsDir: join(supply.isolatedRoot(), 'libs', 'node_modules'),
      pluginDirOf: (pkg) => {
        const entry = ledger.read(pkg);
        return entry === undefined ? undefined : pluginDirOf(entry, ledger.pluginFiles);
      },
    });
    const prereleaseChannels = (): readonly string[] =>
      (ctx.get(WORKBENCH_SETTINGS_SERVICE) as WorkbenchSettingsStore | undefined)?.read().prereleaseChannels ?? [];
    const reconcile = (rows: readonly string[]): Promise<ProfileReload> => reconcileProfileRows(ctx, rows);
    const seam = seamOf(ctx);
    const moduleManifests = (): readonly UnitManifest[] => {
      const list = manifests();
      if (installable === undefined) return list.filter((manifest) => supplyNeedsOf(manifest).length > 0);
      const ids = new Set(installable());
      return list.filter((manifest) => ids.has(manifest.id));
    };
    const bundles = supply.readBundleManager(ctx);
    const market = createMarketService({
      manifests: moduleManifests(),
      manifestsNow: moduleManifests,
      ...(probe === undefined ? {} : { probe }),
      seam,
      command: cliCommandOf(ctx),
      supply,
      bundles,
      installed: (pkg) => supply.readInstalledModule(profileDir, pkg),
      modules: () => supply.profileModules(profileDir),
      workbench: (pkg) => supply.readProfilePackage(profileDir, pkg),
      prereleaseChannels,
      reconcile,
      registries: supply.createRegistryNotebook(profileDir),
      profileDir,
      ledger,
      references: () => {
        const gaps = supply.declarationGaps(profileDir);
        return gaps === undefined
          ? { trustworthy: false, unreadable: [] }
          : { trustworthy: gaps.length === 0, unreadable: gaps.map((gap: { pkg: string }) => gap.pkg) };
      },
      onUninstalled: (unit) => {
        panels.release(unit);
      },
      onInstalled: (unit) => {
        panels.accept(unit);
      },
      isReleased: (unit) => panels.isReleased(unit),
      dshHome: () => dshHome(),
      profileName: () => (profileDir === null ? null : basename(profileDir)),
      logger,
    });

    const marketRoot = workbenchRoot();
    const marketSources = createMarketSourcesStore({ root: marketRoot, ...(logger === undefined ? {} : { logger }) });
    const marketIndex = createMarketIndexReader({ root: marketRoot, ...(logger === undefined ? {} : { logger }) });
    const marketDocs = createMarketDocReader({ root: marketRoot, ...(logger === undefined ? {} : { logger }) });
    const marketInit = createMarketSourceInitializer({ root: marketRoot, store: marketSources });
    const discover = createMarketDiscover({
      store: marketSources,
      reader: marketIndex,
      docs: marketDocs,
      installedDocs: (name, version, kind) => installedPackages.doc(name, version, kind),
      modules: () => supply.profileModules(profileDir),
      ...(profileDir === null ? {} : { profilePath: profileDir }),
      defaultRegistry: async () => {
        try {
          return (await bundles?.registries())?.resolved ?? undefined;
        } catch {
          return undefined;
        }
      },
      seam,
      ...(logger === undefined ? {} : { logger }),
    });

    const publishPreflight = createPublishPreflight(ctx, {
      root: (workspace) => (workspace === undefined ? null : registeredWorkspacePathOf(ctx, workspace)),
      previewOf: publishPreviewOf,
      inferredAuthorOf,
    });
    const approvalProbes: PanelApprovalProbes = {
      switchDenyOf: (id) => panels.switchDenyOf(id),
      moduleDenyOf: (unit) => {
        if (moduleManifests().some((manifest) => manifest.id === unit)) return undefined;
        if ((supply.profileModules(profileDir) ?? []).some((module) => module.unit === unit)) return undefined;
        return `没有这个模块：${unit}（可用：${moduleManifests().map((manifest) => manifest.id).join(', ') || '（空）'}）`;
      },
      debugOf: () => debug.live(Date.now()),
      pluginDenyOf: (name, updating) => {
        const entry = ledger.read(name) ?? ledger.heldAsPlugin(name);
        if (entry === undefined) {
          const known = ledger.list().map((one) => one.name ?? one.package);
          return `插件记录中没有「${name}」（包名与插件名均可）；已安装插件：${known.join('、') || '（空）'}`;
        }
        if (updating && (entry.local === true || entry.registry === undefined)) {
          return `「${entry.package}」从本地安装，没有可查询的新版本。`;
        }
        return undefined;
      },
      debugUnitsOf: (workspace) => {
        const root = workspace === undefined ? null : registeredWorkspacePathOf(ctx, workspace);
        return root === null ? [] : unitsOf(ctx, root).units.map((one) => one.unit);
      },
      recordUrlDenyOf: ({ unit, url, workspace }) => {
        const root = workspace === undefined ? null : registeredWorkspacePathOf(ctx, workspace);
        if (root === null) return undefined;
        const found = unitsOf(ctx, root).units.find((one) => one.unit === unit);
        if (found === undefined || found.dir === '') return undefined;
        const foreign = foreignDomainText(readDesignOfModule(found.dir), url);
        return foreign === '' ? undefined : foreign;
      },
    };

    const denySets = (context: ToolScopeContext) => {
      const boards = panels.boards(context.workspace);
      const owned = new Set(ownedUnits());
      const surface = hostSurface({ profile: profileDir === null ? undefined : basename(profileDir) });
      const hiddenUnitOf = new Map<string, string>();
      for (const manifest of manifests()) {
        if (owned.has(manifest.id) || resolveScope({ id: manifest.id, boards })) continue;
        for (const tool of manifest.tools) hiddenUnitOf.set(tool.name, manifest.id);
      }
      return {
        packs: toolbox.deniedTools(context),
        hiddenUnitOf,
        screen: new Set<string>(screenOnlyToolsFor(surface.capabilities.pageDebug)),
      };
    };

    return {
      routes: {
        ...panelRoutes(panels, values),
        ...pluginRoutes({
          ledger,
          ...(runtimeLabel === '' ? {} : { runtimeLabel }),
          ...(runtimeField === '' ? {} : { runtimeField }),
          supply,
          ...(seam === undefined ? {} : { seam }),
          prereleaseChannels,
        }),
        ...diyDebugRoutes(debug),
        ...diyFlowRoutes(diyRuns),
        ...diyRecordRoutes(record),
        ...marketDiscoverRoutes(discover),
        ...marketSourcesRoutes(marketSources),
        ...marketInstalledRoutes({
          refresh: async ({ force }) => {
            const read = marketSources.read();
            const reads = await Promise.all(
              read.sources.map((source) => marketIndex.read(source, force ? { force: true } : {})),
            );
            for (const one of reads) {
              if (!one.ok) return one.problem;
            }
            return undefined;
          },
          read: async () => {
            const read = marketSources.read();
            return {
              modules: await installedFromIndexes({
                sources: read.sources,
                cached: (source) => marketIndex.cached(source)?.index,
                modules: supply.profileModules(profileDir),
                dependencyOf: dependencyReader(profileDir),
                isNewer: supply.isNewerVersion,
                preferred: (host) => read.transports?.[host],
                probe: (url: string) => probeGitAddressCached(url, { timeoutMs: 4000 }).then((one) => one.status),
              }),
            };
          },
        }),
        ...installedPackageRoutes((pkg) => installedPackages.info(pkg)),
        ...publishPreviewRoutes(
          { registered: (workspace) => registeredWorkspacePathOf(ctx, workspace) },
          inferredAuthorOf,
        ),
      },
      longTasks: installRuns,
      registerTools: () => [
        ...registerToolboxTools(ctx, toolbox),
        ...registerDiagTools(ctx),
        ...registerPanelTools(ctx, panels, values),
        ...registerMarketTools(
          ctx,
          market,
          {
            read: () => marketSources.read(),
            init: marketInit,
            readOnly: (id) => markSourceReadOnly(marketSources, id),
          },
          () => discover.snapshot(),
        ),
        ...registerDiyTools(
          ctx,
          market,
          panels,
          debug,
          publishPreviewOf,
          inferredAuthorOf,
          installRuns,
        ),
        ...registerDiyPlanTool(ctx, diyRuns),
        ...registerDiyStepTool(ctx, diyRuns),
        ...registerRecordTools(ctx, record, recordFlowOf(diyRuns)),
        ...registerLongTaskTools(ctx, longTaskRuns),
        ...registerUnitSkills({
          skills: ctx.get('skills') as UnitSkillDeps['skills'],
          manifests,
          toolbox,
          workspaceOf: (cwd) => registeredWorkspacePathOf(ctx, cwd),
          subscribe: (listener) => panels.subscribe(listener),
        }),
      ],
      factsOf: (call) => panelsFactsOf(call, manifests()),
      needsApproval: panelsApprovalFor(
        longTaskRuns,
        () => record.live(Date.now()),
        ({ workspace, unit, author }) => {
          const root = workspace === undefined ? null : registeredWorkspacePathOf(ctx, workspace);
          if (root === null) {
            return {
              ok: false,
              reason:
                '读不到这条会话的登记工作区，发布不会进行。先在左栏选中这个项目再重试；发布只会写当前工作区。',
            };
          }
          const preview = publishPreviewOf(root, unit, author === undefined ? {} : { author });
          if (preview === null) {
            return {
              ok: false,
              reason:
                `当前工作区（${root}）里没有模块「${unit}」，发布不会进行。` +
                '先用 workbench_diy_status 确认工作区与模块标识；模块在别的项目里，就切到那个项目再发。',
            };
          }
          return { ok: true, preview };
        },
        marketSources,
        (session) => diyRuns.stepOf(session),
        publishPreflight,
        approvalProbes,
      ),
      gate: {
        deniedTools: (context) => {
          const sets = denySets(context);
          return [...new Set([...sets.packs, ...sets.hiddenUnitOf.keys(), ...sets.screen])];
        },
        denyReason: (tool, context) => {
          const sets = denySets(context);
          if (sets.screen.has(tool)) return absentScreenReason(tool);
          const diy = context.preset === DIY_PRESET_ID;
          const unit = sets.hiddenUnitOf.get(tool);
          if (unit !== undefined) return offBoardReason(tool, unit, diy);
          const pack = toolbox.closedPackOf(tool, context);
          if (pack === undefined) return undefined;
          if (diy && pack.id === 'manage') return diyManageAbsentReason(tool);
          return packClosedReason(tool, pack);
        },
        subscribe: (listener) => {
          const offFlow = diyRuns.subscribe(() => listener());
          const offPanels = panels.subscribe(listener);
          const offBox = toolbox.subscribe(listener);
          return () => {
            offFlow();
            offPanels();
            offBox();
          };
        },
      },
      actions: [
        marketSourcesAction(marketSources, marketInit),
        diagExportAction(ctx),
      ],
      prefs: { resource: PANELS_PREF_RESOURCE, handle: (payload: unknown) => applyPanelsPref(panels, payload) },
      provision: {
        handle: async (request) => {
          const result = await dispatchMarket(market, request);
          const application = (result as { readonly change?: { readonly application?: string } }).change
            ?.application;
          if (
            request.spec !== undefined &&
            (application === 'applied' || application === 'restart-required' || application === 'overridden')
          ) {
            const used = transportOfSpec(request.spec);
            if (used !== undefined) await marketSources.rememberTransport(used.host, used.kind);
          }
          return result;
        },
        affectedUnits: (request) => affectedUnitsOf(manifests(), request),
      },
    };
  },
};
