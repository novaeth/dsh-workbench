import type { DshShell, UnitManifest } from '@dsh-workbench/shared';
import type { RecordStore, UnitOwnedFace } from '@dsh-workbench/shared/host';
import {
  BROWSER_RECORD_SESSION,
  DIY_DEBUG_SERVICE,
  DIY_RECORD_SERVICE,
  createDebugStore,
  createRecordStore,
  hasEnvSupply,
  PANELS_SERVICE,
  dshHome,
  isolatedHome,
} from '@dsh-workbench/shared/host';
import { basename } from 'node:path';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { hostSurface } from '@/shared/api/host/platform';
import { readBundleManager } from '@/shared/api/host/bundle-manager';
import {
  declarationGaps,
  profileDirOf,
  profileModules,
  readInstalledModule,
  readProfilePackage,
} from '@/shared/api/host/installed-module';
import { opencliCommandOf } from '@/shared/api/host/opencli-command';
import { createRegistryNotebook } from '@/shared/api/host/profile-registries';
import { panelsApprovalFor } from './model/approval';
import { resolveScope } from './model/config';
import { registerLongTaskTools } from './model/long-task-tools';
import { registerDiyTools } from './model/diy-tools';
import { stopObservers, withObserverCleanup } from './model/diy-observers';
import { diyDebugRoutes } from './model/diy-debug-routes';
import { diyRecordRoutes } from './model/diy-record-routes';
import { registerRecordTools } from './model/diy-record-tools';
import { releaseQuietly } from './model/diy-record';
import { createMarketService } from './model/market';
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
  mount({ ctx, logger, manifests, ownedUnits, installable, opencliCommand, probe, store, values, longTaskRuns }) {
    const ledger = createPluginLedger({ store, home: isolatedHome() });
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
          command: opencliCommandOf(ctx).command,
          session: BROWSER_RECORD_SESSION,
          url: state.url,
          captureFile: state.captureFile,
        });
      },
    };
    ctx.provide(DIY_RECORD_SERVICE, record);

    const profileDir = profileDirOf(ctx);
    const shell = ctx.get<DshShell>('shell');
    const moduleManifests = (): readonly UnitManifest[] => {
      const list = manifests();
      if (installable === undefined) return list.filter(hasEnvSupply);
      const ids = new Set(installable());
      return list.filter((manifest) => ids.has(manifest.id));
    };
    const market = createMarketService({
      manifests: moduleManifests(),
      manifestsNow: moduleManifests,
      ...(probe === undefined ? {} : { probe }),
      shell,
      ...(opencliCommand === undefined ? {} : { command: opencliCommand }),
      bundles: readBundleManager(ctx),
      installed: (pkg) => readInstalledModule(profileDir, pkg),
      modules: () => profileModules(profileDir),
      workbench: (pkg) => readProfilePackage(profileDir, pkg),
      registries: createRegistryNotebook(profileDir),
      ledger,
      references: () => {
        const gaps = declarationGaps(profileDir);
        return gaps === undefined
          ? { trustworthy: false, unreadable: [] }
          : { trustworthy: gaps.length === 0, unreadable: gaps.map((gap) => gap.pkg) };
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

    return {
      routes: {
        ...panelRoutes(panels, values),
        ...pluginRoutes({ ledger, ...(shell === undefined ? {} : { shell }) }),
        ...diyDebugRoutes(debug),
        ...diyRecordRoutes(record),
      },
      registerTools: () => [
        ...registerPanelTools(ctx, panels, values),
        ...registerMarketTools(ctx, market),
        ...registerDiyTools(ctx, market, panels, debug),
        ...registerRecordTools(ctx, record),
        ...registerLongTaskTools(ctx, longTaskRuns),
      ],
      factsOf: (call) => panelsFactsOf(call, manifests()),
      needsApproval: panelsApprovalFor(longTaskRuns, () => record.live(Date.now())),
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
      prefs: { resource: PANELS_PREF_RESOURCE, handle: (payload: unknown) => applyPanelsPref(panels, payload) },
      provision: {
        handle: (request) => dispatchMarket(market, request),
        affectedUnits: (request) => affectedUnitsOf(manifests(), request),
      },
    };
  },
};
