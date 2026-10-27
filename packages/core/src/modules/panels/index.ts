import type { DshShell, UnitManifest } from '@dsh-workbench/shared';
import type { RecordStore, UnitOwnedFace } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_SERVICE, DIY_RECORD_SERVICE, createDebugStore, createRecordStore, supplyNeedsOf, PANELS_SERVICE, dshHome, supplyPortOf, workbenchRoot } from '@dsh-workbench/shared/host';
import { basename } from 'node:path';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { workshopPathOf } from '@/shared/api/host/diy';
import { hostSurface } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { panelsApprovalFor } from './model/approval';
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
import { createPluginLedger } from './model/plugin-ledger';
import { pluginPanelRefs } from './model/plugin-panel';
import { pluginRoutes } from './model/plugin-section';
import { registerPanelTools } from './model/tools';
import { DIY_DEBUG_TOOLS, DIY_RECORD_TOOLS, DIY_TOOLS, panelsUnit, screenOnlyToolsFor } from './unit';

export const panelsHost: UnitOwnedFace = {
  unit: panelsUnit.id,
  manifest: panelsUnit,
  mount({ ctx, logger, manifests, ownedUnits, installable, probe, store, values, longTaskRuns }) {
    const supply = supplyPortOf(ctx);
    const ledger = createPluginLedger({ store, home: supply.isolatedHome() });
    const panels = createPanelsService({
      manifests,
      store,
      owned: ownedUnits,
      plugins: () => pluginPanelRefs(ledger),
      logger,
    });
    ctx.provide(PANELS_SERVICE, panels);
    const debug = withObserverCleanup(createDebugStore(), (workspace) => stopObservers(ctx, workspace), logger);
    ctx.provide(DIY_DEBUG_SERVICE, debug);
    const base = createRecordStore();
    const record: RecordStore = {
      ...base,
      release: (state) => {
        const shellNow = ctx.get<DshShell>('shell');
        if (shellNow === undefined) return Promise.resolve({ tab: false, capture: false });
        return releaseQuietly({
          shell: shellNow,
          command: cliCommandOf(ctx),
          session: BROWSER_RECORD_SESSION,
          url: state.url,
          captureFile: state.captureFile,
        });
      },
    };
    ctx.provide(DIY_RECORD_SERVICE, record);

    const profileDir = supply.profileDirOf(ctx);
    const shell = ctx.get<DshShell>('shell');
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
      shell,
      command: cliCommandOf(ctx),
      supply,
      bundles,
      installed: (pkg) => supply.readInstalledModule(profileDir, pkg),
      modules: () => supply.profileModules(profileDir),
      workbench: (pkg) => supply.readProfilePackage(profileDir, pkg),
      registries: supply.createRegistryNotebook(profileDir),
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
    const marketIndex = createMarketIndexReader({ root: marketRoot, shell, ...(logger === undefined ? {} : { logger }) });
    const marketDocs = createMarketDocReader({ root: marketRoot, shell, ...(logger === undefined ? {} : { logger }) });
    const marketInit = createMarketSourceInitializer({
      root: marketRoot,
      store: marketSources,
      ...(shell === undefined ? {} : { shell }),
    });
    const discover = createMarketDiscover({
      store: marketSources,
      reader: marketIndex,
      docs: marketDocs,
      modules: () => supply.profileModules(profileDir),
      defaultRegistry: async () => {
        try {
          return (await bundles?.registries())?.resolved ?? undefined;
        } catch {
          return undefined;
        }
      },
      shell,
      ...(logger === undefined ? {} : { logger }),
    });

    return {
      routes: {
        ...panelRoutes(panels, values),
        ...pluginRoutes({ ledger, supply, ...(shell === undefined ? {} : { shell }) }),
        ...diyDebugRoutes(debug),
        ...diyRecordRoutes(record),
        ...marketDiscoverRoutes(discover),
        ...marketSourcesRoutes(marketSources),
        ...publishPreviewRoutes(workshopPathOf(ctx), (unit) =>
          inferredAuthorOf(workshopPathOf(ctx), unit, shell),
        ),
      },
      registerTools: () => [
        ...registerPanelTools(ctx, panels, values),
        ...registerMarketTools(ctx, market, {
          read: () => marketSources.read(),
          init: marketInit,
          readOnly: (id) => markSourceReadOnly(marketSources, id),
        }),
        ...registerDiyTools(
          ctx,
          market,
          panels,
          debug,
          (unit) => publishPreviewOf(workshopPathOf(ctx), unit),
          (unit) => inferredAuthorOf(workshopPathOf(ctx), unit, shell),
        ),
        ...registerRecordTools(ctx, record),
        ...registerLongTaskTools(ctx, longTaskRuns),
      ],
      factsOf: (call) => panelsFactsOf(call, manifests()),
      needsApproval: panelsApprovalFor(
        longTaskRuns,
        () => record.live(Date.now()),
        (unit) => publishPreviewOf(workshopPathOf(ctx), unit),
        marketSources,
      ),
      gate: {
        deniedTools: (context) => {
          const boards = panels.boards(context.workspace);
          const owned = new Set(ownedUnits());
          const surface = hostSurface({ profile: profileDir === null ? undefined : basename(profileDir) });
          const screenOnly = screenOnlyToolsFor(surface.capabilities.pageDebug);
          return [
            ...manifests().flatMap((manifest) =>
              owned.has(manifest.id) || resolveScope({ id: manifest.id, boards })
                ? []
                : manifest.tools.map((tool) => tool.name),
            ),
            ...(context.preset === DIY_PRESET_ID
              ? screenOnly
              : [...DIY_TOOLS, ...DIY_DEBUG_TOOLS, ...DIY_RECORD_TOOLS]),
          ];
        },
        subscribe: (listener) => panels.subscribe(listener),
      },
      actions: [marketSourcesAction(marketSources, marketInit)],
      prefs: { resource: PANELS_PREF_RESOURCE, handle: (payload: unknown) => applyPanelsPref(panels, payload) },
      provision: {
        handle: (request) => dispatchMarket(market, request),
        affectedUnits: (request) => affectedUnitsOf(manifests(), request),
      },
    };
  },
};
