import type { DshHostContext, DshShell } from '../api/dsh.js';
import type { RuntimeCapabilities, RuntimeProfile } from '../contract/capabilities.js';
import type { PluginPackageKind } from '../contract/protocol/bundle-install.js';
import type { LibNeed, SupplySource } from '../contract/needs.js';
import type { NeedProbeInput, UnitCapability } from '../contract/unit-capability.js';
import type { DataReader } from '../contract/data.js';
import type { LibRunner } from '../contract/runner.js';
import type { WorkbenchSelfUpdate } from '../contract/protocol/bundle-install.js';
import type {
  BundleManager,
  InstalledModule,
  ProfileModule,
  ProfilePackage,
  RegistryNotebook,
  RuntimeStatus,
  SelfUpdateRequest,
  SelfUpdateStart,
} from './adapter-types.js';
import type { PostResource, RouteHandler, RouteTable } from './http.js';
import type { PluginSourceOptions, ResolvedPluginSource } from '../contract/plugin-source.js';

export interface LoggerLike {
  info?(message: string): void;
  warn?(message: string): void;
}

export interface ProfilePort {
  dirOf(ctx: DshHostContext): string | null;
  dshPlugins(ctx: DshHostContext): RouteHandler;
  selfUpdateView(root: string, profile: string): WorkbenchSelfUpdate | undefined;
}

export type SupplyPluginSource = ResolvedPluginSource;

export interface SupplyPackageRoute {
  readonly kind: PluginPackageKind | 'dsh-bundle' | 'neither';
  readonly pkg?: string;
  readonly pluginName?: string;
}

export interface SupplyRelease {
  readonly installed?: string;
  readonly latest?: string;
  readonly missing?: readonly string[];
}

export interface SupplyNpmRef {
  readonly name: string;
  readonly version?: string;
}

export interface SupplyPluginInstallOptions {
  readonly spec: string;
  readonly command: string;
  readonly registry?: string | undefined;
  readonly pluginName?: string | undefined;
}

export interface SupplyLatestOptions {
  readonly shell: DshShell;
  readonly name: string;
  readonly registry: string;
  readonly force?: boolean;
}

export interface SupplyMissingPartsOptions {
  readonly shell: DshShell;
  readonly name: string;
  readonly registry: string;
  readonly version: string;
  readonly force?: boolean;
}

export interface SupplyProbeReleaseOptions {
  readonly shell: DshShell;
  readonly package: string;
  readonly registry?: string | undefined;
  readonly force?: boolean;
}

export interface EnvSupplyPort {
  resolvePluginSource(
    source: SupplySource | undefined,
    env: Readonly<Record<string, string | undefined>>,
    options?: PluginSourceOptions,
  ): ResolvedPluginSource;
  libInstallCommand(options: {
    readonly need: LibNeed;
    readonly source: Extract<SupplySource, { kind: 'npm' }>;
    readonly version?: string | undefined;
  }): string;
  pluginInstallPlan(options: SupplyPluginInstallOptions): ResolvedPluginSource;
  latestVersion(options: SupplyLatestOptions): Promise<string | undefined>;
  missingReleaseParts(options: SupplyMissingPartsOptions): Promise<readonly string[]>;
  probeRelease(options: SupplyProbeReleaseOptions): Promise<SupplyRelease | undefined>;
  splitNpmSpec(spec: string): SupplyNpmRef | undefined;
}

export interface ModulePort {
  isolatedRoot(): string;
  isolatedHome(): string;
  cliCatalogPath(): string;
  vendorPluginsDir(): string;
  runtimeInstallCommand(): string;
  afterLibInstall(): void;
  profileDirOf(ctx: DshHostContext): string | null;
  profileModules(dir: string | null): readonly ProfileModule[];
  readInstalledModule(dir: string | null, pkg: string): InstalledModule;
  readProfilePackage(dir: string | null, pkg: string): ProfilePackage | undefined;
  readBundleManager(ctx: DshHostContext): BundleManager | undefined;
  createRegistryNotebook(dir: string | null): RegistryNotebook;
  declarationGaps(dir: string | null): readonly { readonly pkg: string }[] | undefined;
  moduleDeclarationOf(dir: string | null, pkg: string): unknown;
  registryDeclarationOf(options: {
    readonly shell: DshShell;
    readonly name: string;
    readonly registry: string;
    readonly force?: boolean;
  }): Promise<unknown>;
  pathDeclarationOf(spec: string): unknown;
  declarationRefusalOf(name: string, raw: unknown): readonly string[];
  refusalReason(): string;
  packageRouteOf(options: {
    readonly spec: string;
    readonly shell?: DshShell | undefined;
    readonly registry?: string | undefined;
    readonly force?: boolean;
  }): Promise<SupplyPackageRoute | undefined>;
  isNewerVersion(left: string, right: string): boolean;
  startSelfUpdate(request: SelfUpdateRequest, onError: (message: string) => void): SelfUpdateStart;
}

export interface SupplyPort extends EnvSupplyPort, ModulePort {
  readonly env: EnvSupplyPort;
  readonly modules: ModulePort;
}

export interface ProbeUnitsOptions {
  readonly shell: DshShell;
  readonly runtimeCommands: Readonly<Record<string, string>>;
  readonly units: readonly NeedProbeInput[];
  readonly force?: boolean;
}

export interface ProbePreflightInput {
  readonly routes: RouteTable;
  readonly ctx: DshHostContext;
  readonly shell: DshShell;
  readonly runtimeCommands: Readonly<Record<string, string>>;
  readonly runtimeCapabilities: RuntimeCapabilities;
  readonly runtimeCheck?: (() => Promise<RuntimeCheck>) | undefined;
  readonly runtimeLabel?: string | undefined;
  readonly warmReads: () => readonly (readonly string[])[];
}

export interface ProbePort {
  probeUnits(options: ProbeUnitsOptions): Promise<UnitCapability[]>;
  registerPreflight(input: ProbePreflightInput): void;
  declaredPluginCommands(profileDir: string | null): ReadonlyMap<string, ReadonlySet<string>>;
}

export interface RuntimeSeedOptions {
  readonly corePackageUrl: string;
  readonly log: (message: string) => void;
}

export type { RuntimeCapabilities, RuntimeProfile, RuntimeTerms } from '../contract/capabilities.js';

export interface RuntimeCheck {
  readonly ok: boolean;
  readonly detail: string;
}

export interface RuntimeCommandSurface {
  readonly name: string;
  readonly pluginPrefix: string;
  invoke(site: string, command?: string): string;
  help(site: string): string;
  readonly authorHint?: string;
}

export interface RuntimePort {
  packageRoot(moduleUrl: string): string;
  capabilities(ctx: DshHostContext): RuntimeCapabilities;
  profile?(ctx: DshHostContext): RuntimeProfile;
  commandSurface?(ctx: DshHostContext): RuntimeCommandSurface | undefined;
  check?(ctx: DshHostContext): Promise<RuntimeCheck>;
  commands(ctx: DshHostContext): Readonly<Record<string, string>>;
  runners(ctx: DshHostContext, data: DataReader): Readonly<Record<string, LibRunner>>;
  health(ctx: DshHostContext): Readonly<Record<string, RuntimeStatus>>;
  seed(ctx: DshHostContext, options: RuntimeSeedOptions): void;
  warnUnwritableRoot(ctx: DshHostContext): void;
}

export interface PluginDeclarationSource {
  readonly pkg: string;
  readonly declaration: unknown;
}

export interface PluginRowRef {
  readonly id: string;
  readonly pkg: string;
  readonly name?: string | undefined;
}

export interface PluginRowsSource {
  listPlugins(workspace: string | null): readonly PluginRowRef[];
  subscribe?(listener: () => void): () => void;
}

export interface PluginUnitsPort {
  refresh(options?: { readonly force?: boolean }): Promise<unknown>;
  touch(): void;
  report(): unknown;
  dispose(): void;
}

export interface PluginUnitsInput {
  readonly registry: { registerPlugin(face: unknown): () => void };
  readonly rows: () => readonly PluginRowRef[];
  readonly declared: (plugin: string) => ReadonlySet<string>;
  readonly toolNames?: () => ReadonlySet<string>;
  readonly logger?: LoggerLike | undefined;
}

export interface PluginSurface {
  declarationLookup(profileDir: string | null): (unit: string) => PluginDeclarationSource | undefined;
  createUnits(input: PluginUnitsInput): PluginUnitsPort;
}

export interface ConfigSyncInput {
  readonly home: string;
  readonly self: string;
  readonly profileDir: string | null;
  readonly reconcile?: (() => Promise<boolean | void>) | undefined;
}

export interface ProfileCreateInput {
  readonly home: string;
  readonly self: string;
  readonly packageRoot: string;
  readonly runSetup?:
    | ((env: Readonly<Record<string, string>>) => Promise<{ ok: boolean; log: string }>)
    | undefined;
}

export interface HostActions {
  configSyncHandler(input: ConfigSyncInput): RouteHandler;
  profileCreateHandler(input: ProfileCreateInput): RouteHandler;
  configSyncAction(input: ConfigSyncInput): PostResource;
  profileCreateAction(input: ProfileCreateInput): PostResource;
}
