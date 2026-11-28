import type { CapabilityPayload, NeedState, UnitManifest } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import type { PanelSource } from '@dsh-workbench/shared/contract/protocol/panels';
import type {
  BundleInspectionPayload,
  BundleRegistriesPayload,
  UnreadableModule,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';

export type WorldSchemaVersion = 1;

export type Provenance =
  | { readonly kind: 'captured'; readonly hostVersion: string; readonly at: string }
  | { readonly kind: 'derived'; readonly from: string; readonly changed: readonly string[] }
  | { readonly kind: 'fault'; readonly fault: string }
  | { readonly kind: 'transport'; readonly note: string };

export interface UnitTitle {
  readonly zh: string;
  readonly en?: string;
}

export interface InstalledModule {
  readonly unit: string;
  readonly pkg: string;
  readonly title: UnitTitle;
  readonly installed: string;
  readonly latest?: string | undefined;
  readonly local?: boolean | undefined;
  readonly refused?: readonly string[] | undefined;
  readonly manifest?: UnitManifest | undefined;
  readonly sourceId?: string | undefined;
  readonly installable?: boolean | undefined;
  readonly packageModule?: boolean | undefined;
  readonly spec?: string | undefined;
  readonly latestUnavailable?: 'local' | 'no-registry' | 'not-registry' | 'probe-failed' | undefined;
  readonly latestBlocked?: unknown;
}

export interface CapabilityRow {
  readonly unit: string;
  readonly status: CapabilityPayload['status'];
  readonly needs?: readonly NeedState[] | undefined;
  readonly detail?: string | undefined;
}

export interface InstalledPluginState {
  readonly pkg: string;
  readonly name?: string | undefined;
  readonly installed?: string | undefined;
  readonly latest?: string | undefined;
  readonly local?: boolean | undefined;
  readonly broken?: boolean | undefined;
  readonly registry?: string | undefined;
  readonly installedAt?: string | undefined;
}

export interface WorkbenchState {
  readonly pkg: string;
  readonly installed: string;
  readonly latest?: string | undefined;
  readonly running?: string | undefined;
  readonly local?: boolean | undefined;
  readonly broken?: boolean | undefined;
  readonly spec?: string | undefined;
  readonly registry?: string | undefined;
  readonly dshVersion?: string | undefined;
  readonly rescue?: string | undefined;
  readonly diskOlder?: boolean | undefined;
  readonly latestBlocked?: unknown;
  readonly followUp?:
    | { readonly id: string; readonly kind: string; readonly hard?: boolean | undefined }
    | undefined;
}

export interface PanelUnitConfig {
  readonly unit: string;
  readonly shown: boolean;
  readonly source?: PanelSource | undefined;
  readonly order?: number | undefined;
  readonly hasCard?: boolean | undefined;
}

export interface PanelPluginConfig {
  readonly pkg: string;
  readonly title?: string | undefined;
  readonly shown: boolean;
  readonly source?: PanelSource | undefined;
}

export interface WorkspacePanelConfig {
  readonly id: string;
  readonly path?: string | undefined;
  readonly units: readonly PanelUnitConfig[];
  readonly plugins?: readonly PanelPluginConfig[] | undefined;
  readonly pendingUnits?: readonly string[] | undefined;
  readonly withdrawnUnits?: readonly string[] | undefined;
  readonly defaults?: readonly string[] | undefined;
  readonly changed?: Readonly<Record<string, number>> | undefined;
  readonly own?: boolean | undefined;
}

export interface MarketSourceState {
  readonly id: string;
  readonly label: string;
  readonly kind: 'npm' | 'git';
  readonly url?: string | undefined;
  readonly ref?: string | undefined;
  readonly path?: string | undefined;
  readonly localPath?: string | undefined;
  readonly registry?: string | undefined;
  readonly policy?: 'artifacts-in-repo' | 'catalog-only' | undefined;
}

export interface MarketState {
  readonly sources: readonly MarketSourceState[];
}

export type FaultMode =
  | { readonly kind: 'http'; readonly status: number; readonly body?: unknown }
  | { readonly kind: 'adapter-error'; readonly error: string }
  | { readonly kind: 'hang' }
  | { readonly kind: 'latency'; readonly ms: number }
  | { readonly kind: 'envelope'; readonly body: unknown };

export type Faults = Readonly<Record<string, FaultMode>>;

export type WriteMode =
  | { readonly kind: 'ok'; readonly facts?: readonly string[] }
  | { readonly kind: 'fail'; readonly status?: number; readonly code: string; readonly message: string; readonly detail?: string }
  | { readonly kind: 'hang' };

export type Writes = Readonly<Record<string, WriteMode>>;

export interface MachineState {
  readonly modules: readonly InstalledModule[];
  readonly plugins: readonly InstalledPluginState[];
  readonly capabilities: readonly CapabilityRow[];
  readonly workbench: WorkbenchState;
  readonly preflight: PreflightSnapshot;
  readonly unreadable?: readonly UnreadableModule[] | undefined;
}

export interface World {
  readonly schemaVersion: WorldSchemaVersion;
  readonly provenance: Provenance;
  readonly machine: MachineState;
  readonly workspaces: readonly WorkspacePanelConfig[];
  readonly market: MarketState;
  readonly faults: Faults;
  readonly writes?: Writes | undefined;
  readonly bundle?: BundleState | undefined;
  readonly catalog?: CatalogState | undefined;
}

export interface CatalogState {
  readonly manifests: readonly UnitManifest[];
  readonly installable: readonly string[];
  readonly refusals?: readonly { readonly unit: string; readonly pkg: string; readonly reasons: readonly string[] }[] | undefined;
}

export interface BundleState {
  readonly registries: BundleRegistriesPayload;
  readonly inspections?: Readonly<Record<string, BundleInspectionPayload>> | undefined;
  readonly inspect?: BundleInspectionPayload | undefined;
}

export interface WorldProblem {
  readonly code: string;
  readonly at: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly WorldProblem[] };
