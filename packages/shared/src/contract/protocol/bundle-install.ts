import type { MarketInstalledModule } from './market-index.js';
import type { UnitTitle } from '../unit.js';

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
  readonly origins?: readonly string[];
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

export const SHIPPED_APPLICATIONS = ['applied', 'restart-required', 'overridden'] as const satisfies readonly BundleApplication[];

export function isShippedApplication(value: BundleApplication): boolean {
  return (SHIPPED_APPLICATIONS as readonly BundleApplication[]).includes(value);
}

export const SELF_UPDATE_STATES = ['running', 'queued', 'ok', 'restored', 'failed', 'pending-restart'] as const;

export type SelfUpdateState = (typeof SELF_UPDATE_STATES)[number];

export const SELF_UPDATE_RUNNING_TTL_MS = 600_000;

export const SELF_UPDATE_QUEUED_TTL_MS = 43_200_000;

export const SELF_UPDATE_REASONS = ['occupied', 'incomplete'] as const;

export type SelfUpdateReason = (typeof SELF_UPDATE_REASONS)[number];

export interface WorkbenchSelfUpdate {
  readonly state: SelfUpdateState;
  readonly migration?: boolean;
  readonly profile?: string;
  readonly from?: string;
  readonly to?: string;
  readonly version?: string;
  readonly at?: string;
  readonly reason?: SelfUpdateReason;
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

export interface BundleIncompatible {
  readonly name: string;
  readonly version: string;
  readonly runtimeVersion: string;
  readonly requirements: Readonly<Record<string, string>>;
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
  readonly incompatible?: readonly BundleIncompatible[];
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

export type BundleVersionProblem = 'not-updatable' | 'not-found' | 'network' | 'unknown';

export interface BundleRegistryAttempt {
  readonly registry: BundleRegistry;
  readonly problem?: BundleVersionProblem;
  readonly reason?: string;
}

export interface BundleVersionEntry {
  readonly version: string;
  readonly publishedAt?: string;
  readonly tags: readonly string[];
  readonly prerelease: boolean;
  readonly bundle: boolean;
  readonly deprecated?: string;
  readonly incompatible?: BundleIncompatible;
}

export interface BundleVersionListListed {
  readonly status: 'listed';
  readonly installed: string;
  readonly registry: BundleRegistry;
  readonly attempts: readonly BundleRegistryAttempt[];
  readonly versions: readonly BundleVersionEntry[];
  readonly omitted: number;
}

export interface BundleVersionListRefused {
  readonly status: 'refused';
  readonly problem: BundleVersionProblem;
  readonly reason: string;
  readonly attempts: readonly BundleRegistryAttempt[];
}

export type BundleVersionList = BundleVersionListListed | BundleVersionListRefused;

export type BundleUpdateStep = 'check' | 'remove' | 'install';

export interface BundleUpdateOutcome {
  readonly from: string;
  readonly to: string;
  readonly step: BundleUpdateStep;
  readonly change: BundleChange;
  readonly restore?: BundleChange;
}

export interface BundleUpdateRequest {
  readonly registry?: BundleRegistry;
  readonly requestId?: string;
}

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

export type PluginPackageKind = 'runtime-plugin';

export function isPluginPackageKind(kind: unknown): kind is PluginPackageKind {
  return kind === 'runtime-plugin';
}

export interface BundleInstalledPlugin {
  readonly kind: PluginPackageKind;
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

export interface ModuleUpdateBlock {
  readonly kind: 'needs-workbench' | 'incompatible';
  readonly requirements?: Readonly<Record<string, string>>;
  readonly runtimeVersion?: string;
}

export type LatestUnavailable = 'local' | 'no-registry' | 'not-registry' | 'probe-failed';

export interface ModuleVersion {
  readonly unit: string;
  readonly pkg: string;
  readonly installed: string;
  readonly title?: UnitTitle;
  readonly latest?: string;
  readonly latestBlocked?: ModuleUpdateBlock;
  readonly latestUnavailable?: LatestUnavailable;
  readonly local?: boolean;
  readonly refused?: readonly string[];
  readonly market?: MarketInstalledModule;
  readonly versions?: BundleVersionList;
  readonly spec?: string;
  readonly registry?: string;
}

export interface WorkbenchVersion {
  readonly pkg: string;
  readonly installed: string;
  readonly latest?: string;
  readonly latestBlocked?: ModuleUpdateBlock;
  readonly running?: string;
  readonly local?: boolean;
  readonly spec?: string;
  readonly registry?: string;
  readonly broken?: boolean;
  readonly rescue?: string;
  readonly followUp?: {
    readonly id: string;
    readonly kind: 'data-migration';
    readonly hard: boolean;
  };
}

export interface ModuleVersionsPayload {
  readonly modules: readonly ModuleVersion[];
  readonly workbench?: WorkbenchVersion;
  readonly selfUpdate?: WorkbenchSelfUpdate;
}
