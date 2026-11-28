import type { UnitManifest } from '@dsh-workbench/shared';
import type { UnreadableModule } from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import type {
  CapabilityRow,
  Faults,
  InstalledModule,
  InstalledPluginState,
  MarketSourceState,
  MarketState,
  PanelPluginConfig,
  PanelUnitConfig,
  Provenance,
  WorkspacePanelConfig,
  BundleState,
  CatalogState,
  WorkbenchState,
  World,
  Writes,
} from './types';
import { transport } from './provenance';

export const READY_PREFLIGHT: PreflightSnapshot = {
  phase: 'ready',
  at: 0,
  steps: [
    { id: 'cli', status: 'ok', detail: '2.0.3' },
    { id: 'bridge', status: 'ok', detail: 'Everything looks good!' },
  ],
};

export function minimalManifest(id: string, over: Partial<UnitManifest> = {}): UnitManifest {
  return {
    id,
    titleKey: `${id}.title`,
    card: null,
    tools: [],
    host: { inject: [] },
    ...over,
  };
}

export function installedModule(
  unit: string,
  over: Partial<InstalledModule> = {},
): InstalledModule {
  const manifest = over.manifest ?? minimalManifest(unit);
  return {
    unit,
    pkg: `@fixture/${unit}`,
    title: { zh: unit },
    installed: '0.1.0',
    manifest,
    ...over,
  };
}

export function capabilityOf(
  unit: string,
  status: CapabilityRow['status'] = 'ok',
  needs: CapabilityRow['needs'] = [],
): CapabilityRow {
  return { unit, status, needs };
}

export function installedPlugin(
  pkg: string,
  over: Partial<InstalledPluginState> = {},
): InstalledPluginState {
  return { pkg, installed: '0.1.0', ...over };
}

export function marketSource(
  id: string,
  over: Partial<MarketSourceState> = {},
): MarketSourceState {
  return { id, label: id, kind: 'npm', ...over };
}

export function panelUnit(unit: string, shown = true): PanelUnitConfig {
  return { unit, shown };
}

export function panelPlugin(pkg: string, shown = true): PanelPluginConfig {
  return { pkg, shown };
}

export function workspacePanel(
  id: string,
  units: readonly PanelUnitConfig[],
  over: Partial<WorkspacePanelConfig> = {},
): WorkspacePanelConfig {
  return { id, units, ...over };
}

export interface WorldInput {
  readonly provenance?: Provenance;
  readonly modules?: readonly InstalledModule[];
  readonly plugins?: readonly InstalledPluginState[];
  readonly capabilities?: readonly CapabilityRow[];
  readonly workbench?: Partial<WorkbenchState>;
  readonly preflight?: PreflightSnapshot;
  readonly workspaces?: readonly WorkspacePanelConfig[];
  readonly market?: Partial<MarketState>;
  readonly unreadable?: readonly UnreadableModule[];
  readonly faults?: Faults;
  readonly writes?: Writes;
  readonly bundle?: Partial<BundleState>;
  readonly catalog?: CatalogState;
}

export const DEFAULT_BUNDLE: BundleState = {
  registries: { available: false, registries: null },
  inspections: {},
};

export const DEFAULT_WORKBENCH: WorkbenchState = {
  pkg: '@dsh-workbench/core',
  installed: '1.5.6',
};

export function world(input: WorldInput = {}): World {
  return {
    schemaVersion: 1,
    provenance: input.provenance ?? transport('默认测试世界'),
    machine: {
      modules: input.modules ?? [],
      plugins: input.plugins ?? [],
      capabilities: input.capabilities ?? [],
      workbench: { ...DEFAULT_WORKBENCH, ...input.workbench },
      preflight: input.preflight ?? READY_PREFLIGHT,
      ...(input.unreadable === undefined ? {} : { unreadable: input.unreadable }),
    },
    workspaces: input.workspaces ?? [],
    market: { sources: input.market?.sources ?? [] },
    faults: input.faults ?? {},
    writes: input.writes ?? {},
    bundle: { ...DEFAULT_BUNDLE, ...input.bundle },
    ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
  };
}

export function emptyWorld(): World {
  return world();
}
