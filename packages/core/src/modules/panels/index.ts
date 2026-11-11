import type { UnitManifest } from '@dsh-workbench/shared';
import type { RecordStore, UnitOwnedFace } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_SERVICE, DIY_RECORD_SERVICE, MCP_TOOLS_SERVICE, TOOLBOX_SERVICE, createDebugStore, createRecordStore, supplyNeedsOf, PANELS_SERVICE, dshHome, seamOf, supplyPortOf, workbenchRoot } from '@dsh-workbench/shared/host';
import type { McpToolsPort, ToolboxPort, ToolScopeContext } from '@dsh-workbench/shared/host';
import { basename } from 'node:path';
import { workshopPathOf } from '@/shared/api/host/diy';
import { hostSurface } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { panelsApprovalFor } from './model/approval-policy';
import { resolveScope } from './model/config';
import { registerLongTaskTools } from './model/long-task-tools';
import { registerDiyTools } from './model/diy-tools';
import { inferredAuthorOf, publishPreviewOf } from '@/shared/api/host/diy-publish-preview';
import { stopObservers, withObserverCleanup } from './model/diy-observers';
import { diyDebugRoutes } from './model/diy-debug-routes';
import { diyRecordRoutes } from './model/diy-record-routes';
import { registerRecordTools } from './model/diy-record-tools';
import { releaseQuietly } from './model/diy-record';
import { createMarketService } from './model/market';
import { createMarketDiscover } from './model/market-discover';
import { marketDiscoverRoutes } from './model/market-discover-routes';
import { installedFromIndexes, marketInstalledRoutes, transportOfSpec } from './model/market-installed';
import { dependencyReader } from '@/shared/api/host/profile-dependencies';
import { probeGitAddressCached } from '@/shared/api/host/git-probe';
import { markSourceReadOnly, marketSourcesAction, marketSourcesRoutes } from './model/market-sources-act';
import { publishPreviewRoutes } from './model/publish-preview-routes';
import { createMarketIndexReader } from '@/shared/api/host/market-index-fetch';
import { createMarketDocReader } from '@/shared/api/host/market-doc';
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
import { registerPanelTools } from './model/tools';
import { createToolbox } from './model/toolbox';
import { capabilityBriefOf } from './model/capability-brief';
import { absentScreenReason, offBoardReason, packClosedReason } from './model/closed-tool';
import { registerToolboxTools } from './model/toolbox-tools';
import { panelsUnit, screenOnlyToolsFor } from './unit';

export const panelsHost: UnitOwnedFace = {
  unit: panelsUnit.id,
  manifest: panelsUnit,
  mount({ ctx, logger, manifests, ownedUnits, installable, probe, store, values, longTaskRuns }) {
    const supply = supplyPortOf(ctx);
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
    const toolbox = createToolbox({
      manifests,
      visibleUnits,
      mcp: () => (ctx.get(MCP_TOOLS_SERVICE) as McpToolsPort | undefined)?.servers() ?? [],
    });
    const toolboxPort: ToolboxPort = {
      packsOf: (session, preset) => toolbox.packsOf(session, preset),
      capabilityBrief: (workspace) => capabilityBriefOf(toolbox.catalog(workspace)),
    };
    ctx.provide(TOOLBOX_SERVICE, toolboxPort);
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
    const includePrerelease = (): boolean =>
      (ctx.get(WORKBENCH_SETTINGS_SERVICE) as WorkbenchSettingsStore | undefined)?.read().includePrerelease === true;
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
      includePrerelease,
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
          supply,
          ...(seam === undefined ? {} : { seam }),
          includePrerelease,
        }),
        ...diyDebugRoutes(debug),
        ...diyRecordRoutes(record),
        ...marketDiscoverRoutes(discover),
        ...marketSourcesRoutes(marketSources),
        ...marketInstalledRoutes(async () => ({
          modules: await installedFromIndexes({
            sources: marketSources.read().sources,
            cached: (source) => marketIndex.cached(source)?.index,
            modules: supply.profileModules(profileDir),
            dependencyOf: dependencyReader(profileDir),
            isNewer: supply.isNewerVersion,
            preferred: (host) => marketSources.read().transports?.[host],
            probe: (url: string) => probeGitAddressCached(url, { timeoutMs: 4000 }).then((one) => one.status),
          }),
        })),
        ...publishPreviewRoutes(workshopPathOf(ctx), (unit) =>
          inferredAuthorOf(workshopPathOf(ctx), unit),
        ),
      },
      registerTools: () => [
        ...registerToolboxTools(ctx, toolbox),
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
          (unit) => publishPreviewOf(workshopPathOf(ctx), unit),
          (unit) => inferredAuthorOf(workshopPathOf(ctx), unit),
        ),
        ...registerRecordTools(ctx, record),
        ...registerLongTaskTools(ctx, longTaskRuns),
      ],
      factsOf: (call) => panelsFactsOf(call, manifests()),
      needsApproval: panelsApprovalFor(
        longTaskRuns,
        () => record.live(Date.now()),
        (unit, author) =>
          publishPreviewOf(workshopPathOf(ctx), unit, author === undefined ? {} : { author }),
        marketSources,
        toolbox,
      ),
      gate: {
        deniedTools: (context) => {
          const sets = denySets(context);
          return [...new Set([...sets.packs, ...sets.hiddenUnitOf.keys(), ...sets.screen])];
        },
        denyReason: (tool, context) => {
          const sets = denySets(context);
          if (sets.screen.has(tool)) return absentScreenReason(tool);
          const unit = sets.hiddenUnitOf.get(tool);
          if (unit !== undefined) return offBoardReason(tool, unit);
          const pack = toolbox.closedPackOf(tool, context);
          return pack === undefined ? undefined : packClosedReason(tool, pack);
        },
        subscribe: (listener) => {
          const offPanels = panels.subscribe(listener);
          const offBox = toolbox.subscribe(listener);
          return () => {
            offPanels();
            offBox();
          };
        },
      },
      actions: [marketSourcesAction(marketSources, marketInit)],
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
