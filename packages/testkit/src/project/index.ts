import type { CapabilityPayload } from '@dsh-workbench/shared';
import type {
  ModuleVersion,
  ModuleVersionsPayload,
  WorkbenchVersion,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type {
  MarketIndexSource,
  MarketInstalledModule,
  MarketInstalledPayload,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import type {
  PanelPluginView,
  PanelUnitView,
  PanelsPayload,
} from '@dsh-workbench/shared/contract/protocol/panels';
import type {
  BundleInspectionPayload,
  BundleRegistriesPayload,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type { UnitManifestsPayload } from '@dsh-workbench/shared/contract/protocol/unit-manifests';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import type {
  CapabilityRow,
  FaultMode,
  InstalledModule,
  InstalledPluginState,
  MarketSourceState,
  WorkspacePanelConfig,
  World,
} from '../world/types';
import {
  BUNDLE_INSPECT_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  CAPABILITY_ROUTE,
  HEALTH_ROUTE,
  INSTALLED_PLUGINS_ROUTE,
  MARKET_INSTALLED_ROUTE,
  MODULE_VERSIONS_ROUTE,
  PANELS_ROUTE,
  PREFLIGHT_ROUTE,
  UNIT_MANIFESTS_ROUTE,
} from './routes';

const LOCAL_SOURCE: MarketSourceState = { id: 'local', label: '本机', kind: 'npm' };

function sourceOf(world: World, module: InstalledModule): MarketSourceState {
  const id = module.sourceId ?? 'local';
  return world.market.sources.find((source) => source.id === id) ?? LOCAL_SOURCE;
}

function marketIndexSourceOf(source: MarketSourceState): MarketIndexSource {
  if (source.kind === 'git') {
    return {
      type: 'git',
      url: source.url ?? '',
      commit: source.ref ?? '',
      ...(source.path === undefined ? {} : { path: source.path }),
    };
  }
  return { type: 'npm', ...(source.registry === undefined ? {} : { registry: source.registry }) };
}

function manifestOf(module: InstalledModule): InstalledModule['manifest'] {
  return module.manifest;
}

export function unitManifestsOf(world: World): UnitManifestsPayload {
  if (world.catalog !== undefined) {
    return {
      ok: true,
      manifests: world.catalog.manifests,
      installable: world.catalog.installable,
      refusals: world.catalog.refusals ?? [],
    };
  }
  const manifests = world.machine.modules.flatMap((module) =>
    manifestOf(module) === undefined ? [] : [manifestOf(module)!],
  );
  const installable = world.machine.modules
    .filter((module) => (module.installable ?? true) && manifestOf(module) !== undefined && (module.refused ?? []).length === 0)
    .map((module) => module.unit);
  const refusals = world.machine.modules.flatMap((module) =>
    (module.refused ?? []).length === 0
      ? []
      : [{ unit: module.unit, pkg: module.pkg, reasons: module.refused ?? [] }],
  );
  return {
    ok: true,
    manifests,
    installable,
    refusals,
  };
}

export function bundleRegistriesOf(world: World): BundleRegistriesPayload {
  return world.bundle?.registries ?? { available: false, registries: null };
}

export function bundleInspectOf(world: World, spec: string | undefined): BundleInspectionPayload {
  const stored = spec === undefined ? undefined : world.bundle?.inspections?.[spec];
  return (
    stored ??
    world.bundle?.inspect ?? {
      inspection: { status: 'refused', problem: 'not-found', reason: `夹具没有这个 spec：${spec ?? ''}` },
    }
  );
}

export function capabilityPayloadOf(world: World): { readonly ok: true; readonly units: readonly CapabilityPayload[] } {
  return {
    ok: true,
    units: world.machine.capabilities.map((row: CapabilityRow): CapabilityPayload => ({
      unit: row.unit,
      status: row.status,
      needs: row.needs ?? [],
      ...(row.detail === undefined ? {} : { detail: row.detail }),
    })),
  };
}

function workspaceOf(world: World, path: string | undefined): WorkspacePanelConfig | undefined {
  return world.workspaces.find((item) => item.path === path || item.id === path) ?? world.workspaces[0];
}

export function panelsOf(world: World, path?: string, own = false): PanelsPayload {
  const workspace = workspaceOf(world, path);
  const units: PanelUnitView[] = (workspace?.units ?? []).map((row) => {
    const module = world.machine.modules.find((item) => item.unit === row.unit);
    const manifest = module?.manifest;
    return {
      id: row.unit,
      titleKey: manifest?.titleKey ?? `${row.unit}.title`,
      ...(row.order === undefined ? {} : { order: row.order }),
      shown: row.shown,
      source: row.source ?? 'user',
      hasCard: row.hasCard ?? (manifest?.card !== null && manifest?.card !== undefined),
    };
  });
  const plugins: PanelPluginView[] = (workspace?.plugins ?? []).map((row) => {
    const plugin = world.machine.plugins.find((item) => item.pkg === row.pkg);
    return {
      id: `plugin:${row.pkg}`,
      pkg: row.pkg,
      title: row.title ?? plugin?.name ?? row.pkg,
      ...(plugin?.name === undefined ? {} : { name: plugin.name }),
      shown: row.shown,
      source: row.source ?? 'user',
    };
  });
  return {
    ok: true,
    units,
    plugins,
    defaults: workspace?.defaults ?? [],
    own: workspace?.own ?? own,
    changed: workspace?.changed ?? {},
  };
}

export function moduleVersionsOf(world: World): ModuleVersionsPayload {
  const modules: ModuleVersion[] = world.machine.modules
    .filter((module) => module.packageModule !== false)
    .map((module) => ({
    unit: module.unit,
    pkg: module.pkg,
    installed: module.installed,
    title: { zh: module.title.zh, en: module.title.en ?? module.title.zh },
    ...(module.latest === undefined ? {} : { latest: module.latest }),
    ...(module.local === true ? { local: true } : {}),
    ...(module.spec === undefined ? {} : { spec: module.spec }),
    ...(module.latestUnavailable === undefined ? {} : { latestUnavailable: module.latestUnavailable }),
    ...(module.latestBlocked === undefined ? {} : { latestBlocked: module.latestBlocked as ModuleVersion['latestBlocked'] }),
    ...(module.refused === undefined ? {} : { refused: module.refused }),
  }));
  const workbench: WorkbenchVersion = {
    pkg: world.machine.workbench.pkg,
    installed: world.machine.workbench.installed,
    ...(world.machine.workbench.latest === undefined ? {} : { latest: world.machine.workbench.latest }),
    ...(world.machine.workbench.running === undefined ? {} : { running: world.machine.workbench.running }),
    ...(world.machine.workbench.local === true ? { local: true } : {}),
    ...(world.machine.workbench.broken === true ? { broken: true } : {}),
    ...(world.machine.workbench.spec === undefined ? {} : { spec: world.machine.workbench.spec }),
    ...(world.machine.workbench.registry === undefined ? {} : { registry: world.machine.workbench.registry }),
    ...(world.machine.workbench.dshVersion === undefined ? {} : { dshVersion: world.machine.workbench.dshVersion }),
    ...(world.machine.workbench.rescue === undefined ? {} : { rescue: world.machine.workbench.rescue }),
    ...(world.machine.workbench.diskOlder === true ? { diskOlder: true } : {}),
    ...(world.machine.workbench.latestBlocked === undefined
      ? {}
      : { latestBlocked: world.machine.workbench.latestBlocked as WorkbenchVersion['latestBlocked'] }),
    ...(world.machine.workbench.followUp === undefined
      ? {}
      : {
          followUp: {
            id: world.machine.workbench.followUp.id,
            kind: 'data-migration' as const,
            hard: world.machine.workbench.followUp.hard ?? false,
          },
        }),
  };
  return {
    ok: true,
    modules,
    workbench,
    ...(world.machine.unreadable === undefined ? {} : { unreadable: world.machine.unreadable }),
  };
}

export function marketInstalledOf(world: World): MarketInstalledPayload {
  const modules: MarketInstalledModule[] = world.machine.modules
    .filter((module) => module.packageModule !== false && module.sourceId !== undefined)
    .map((module) => {
    const source = sourceOf(world, module);
    return {
      pkg: module.pkg,
      unit: module.unit,
      version: module.installed,
      sourceId: source.id,
      sourceLabel: source.label,
      source: marketIndexSourceOf(source),
    };
  });
  return { ok: true, modules };
}

export function installedPluginsOf(world: World): {
  readonly ok: true;
  readonly plugins: readonly InstalledPluginState[];
} {
  return { ok: true, plugins: world.machine.plugins };
}

export function preflightOf(world: World): PreflightSnapshot {
  return world.machine.preflight;
}

export function changesFrame(
  epoch: number,
  rev: number,
  facts: readonly string[],
): { readonly ok: true; readonly epoch: string; readonly rev: number; readonly facts: readonly string[] } {
  return { ok: true, epoch: `wb-${epoch}`, rev, facts };
}

export function faultOf(world: World, route: string): FaultMode | undefined {
  return world.faults[route];
}

export function projectRoute(
  world: World,
  route: string,
  query?: URLSearchParams,
): unknown {
  if (route === UNIT_MANIFESTS_ROUTE) return unitManifestsOf(world);
  if (route === BUNDLE_REGISTRIES_ROUTE) return bundleRegistriesOf(world);
  if (route === BUNDLE_INSPECT_ROUTE) return bundleInspectOf(world, query?.get('spec') ?? undefined);
  if (route === CAPABILITY_ROUTE) return capabilityPayloadOf(world);
  if (route === PANELS_ROUTE) return panelsOf(world, query?.get('path') ?? undefined);
  if (route === MODULE_VERSIONS_ROUTE) return moduleVersionsOf(world);
  if (route === MARKET_INSTALLED_ROUTE) return marketInstalledOf(world);
  if (route === INSTALLED_PLUGINS_ROUTE) return installedPluginsOf(world);
  if (route === PREFLIGHT_ROUTE) return preflightOf(world);
  if (route === HEALTH_ROUTE) {
    return { ok: true, capabilities: { console: true, pluginMarket: true, browserBridge: true } };
  }
  return undefined;
}

export function changesFactsFor(route: string): readonly string[] {
  return [route];
}

export * from './routes';
