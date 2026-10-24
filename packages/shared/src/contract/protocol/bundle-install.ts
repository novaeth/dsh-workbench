export const BUNDLE_REGISTRIES_ROUTE = 'bundle-registries';

export const BUNDLE_INSPECT_ROUTE = 'bundle-inspect';

export const BUNDLE_REGISTRY_DEFAULT = 'default';
export const MODULE_VERSIONS_ROUTE = 'module-versions';

export type BundleRegistry = string | null;

export interface BundleRegistries {
  readonly registry: BundleRegistry;
  readonly fallbackRegistries: readonly BundleRegistry[];
  readonly resolved: string | null;
}

export type BundleInspectProblem =
  | 'invalid-spec'
  | 'already-installed'
  | 'not-found'
  | 'not-a-package'
  | 'not-a-bundle'
  | 'not-a-workbench-module'
  | 'not-a-module-or-plugin'
  | 'network'
  | 'unknown';

export type BundleSpecKind = 'registry' | 'path' | 'git' | 'tarball';

export interface BundleInspectionAccepted {
  readonly status: 'accepted';
  readonly kind: BundleSpecKind;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly bundle: boolean | null;
  readonly registry: BundleRegistry;
  readonly host?: string;
}

export interface BundleInspectionRefused {
  readonly status: 'refused';
  readonly problem: BundleInspectProblem;
  readonly reason: string;
  readonly registries?: readonly BundleRegistry[];
}

export interface BundleInspectionPlugin {
  readonly status: 'plugin';
  readonly pkg: string;
  readonly registry: BundleRegistry;
  readonly pluginName?: string;
  readonly version?: string;
}

export type BundleInspection =
  | BundleInspectionAccepted
  | BundleInspectionRefused
  | BundleInspectionPlugin;

export interface BundleRegistriesPayload {
  readonly available: boolean;
  readonly registries: BundleRegistries | null;
}

export interface BundleInspectionPayload {
  readonly inspection: BundleInspection;
}

export type BundleApplication = 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled';

export const SELF_UPDATE_STATES = ['running', 'ok', 'rolled-back', 'failed'] as const;

export type SelfUpdateState = (typeof SELF_UPDATE_STATES)[number];

export interface WorkbenchSelfUpdate {
  readonly state: SelfUpdateState;
  readonly profile?: string;
  readonly from?: string;
  readonly to?: string;
  readonly version?: string;
  readonly at?: string;
  readonly tail?: string;
}

export const RESTART_REASONS = [
  'no-hmr',
  'package-moved',
  'host-module',
  'unmanaged-plugin',
  'module-comparison',
] as const;

export type RestartReason = (typeof RESTART_REASONS)[number];

export type BundleChangeStage = 'install' | 'enable' | 'remove';

export type BundleFailureKind =
  | 'pnpm-missing'
  | 'timeout'
  | 'not-found'
  | 'no-matching-version'
  | 'network'
  | 'disk-full'
  | 'permission'
  | 'build-blocked'
  | 'integrity'
  | 'unknown';

export interface BundlePackageResult {
  readonly exitCode: number;
  readonly output: string;
  readonly truncated: boolean;
  readonly logPath: string;
  readonly kind?: BundleFailureKind;
}

export interface BundleChange {
  readonly application: BundleApplication;
  readonly stage: BundleChangeStage;
  readonly changed: boolean;
  readonly target: string;
  readonly bundle?: string;
  readonly version?: string;
  readonly errorCode?: string;
  readonly errorDetail?: string;
  readonly packageResult?: BundlePackageResult;
  readonly pendingBuilds?: readonly string[];
  readonly restartReason?: RestartReason;
  readonly failedAt?: 'registry' | 'spec-host';
}

export interface BundleInstallRequest {
  readonly spec: string;
  readonly registry?: BundleRegistry;
  readonly requestId?: string;
  readonly approvedBuilds?: readonly string[];
}

export type BundleCancellation = 'cancelled' | 'too-late' | 'not-running';

export type BundleSupplyState = 'not-a-module' | 'no-needs' | 'installed' | 'failed' | 'pending-restart';

export interface BundleModulePayload {
  readonly kind: 'module' | 'not-module' | 'unknown';
  readonly pkg: string;
  readonly unit?: string;
  readonly version?: string;
}

export interface BundleSupplyPayload {
  readonly state: BundleSupplyState;
  readonly reason?: string;
}

export interface BundleInstalledPlugin {
  readonly kind: 'opencli-plugin';
  readonly pkg: string;
  readonly name?: string;
}

export interface BundleInstallPayload {
  readonly change: BundleChange;
  readonly module: BundleModulePayload;
  readonly supply: BundleSupplyPayload;
  readonly plugin?: BundleInstalledPlugin;
}

export interface BundleRemovePayload {
  readonly change: BundleChange;
  readonly keptFor: readonly string[];
}

export interface BundleCancellationPayload {
  readonly cancellation: BundleCancellation | null;
}

export interface ModuleVersion {
  readonly unit: string;
  readonly pkg: string;
  readonly installed: string;
  readonly latest?: string;
  readonly local?: boolean;
  readonly refused?: readonly string[];
}

export interface WorkbenchVersion {
  readonly pkg: string;
  readonly installed: string;
  readonly latest?: string;
  readonly running?: string;
  readonly local?: boolean;
}

export interface ModuleVersionsPayload {
  readonly modules: readonly ModuleVersion[];
  readonly workbench?: WorkbenchVersion;
  readonly selfUpdate?: WorkbenchSelfUpdate;
}
