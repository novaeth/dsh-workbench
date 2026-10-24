import type { DshHostContext } from '../api/dsh.js';
import type { PluginSourceProblem } from '../contract/plugin-source.js';
import type { WorkbenchSelfUpdate } from '../contract/protocol/bundle-install.js';
import type {
  BundleManager,
  InstalledModule,
  ProfileModule,
  ProfilePackage,
  RegistryNotebook,
} from './adapter-types.js';
import type { RouteHandler } from './http.js';

export interface ProfilePort {
  dirOf(ctx: DshHostContext): string | null;
  dshPlugins(ctx: DshHostContext): RouteHandler;
  selfUpdateView(root: string, profile: string): WorkbenchSelfUpdate | undefined;
}

export type SupplyPluginSource =
  | {
      readonly ok: true;
      readonly commands: readonly { readonly line: string; readonly optional?: true }[];
      readonly line: string;
    }
  | {
      readonly ok: false;
      readonly problem: PluginSourceProblem;
      readonly env?: string;
    };

export interface SupplyPackageRoute {
  readonly kind: 'opencli-plugin' | 'dsh-bundle' | 'neither';
  readonly pkg?: string;
  readonly pluginName?: string;
}

export interface SupplyRelease {
  readonly installed?: string;
  readonly latest?: string;
  readonly missing?: readonly string[];
}

export interface SupplyPort {
  isolatedHome(): string;
  cliCatalogPath(): string;
  vendorPluginsDir(): string;
  opencliInstallCommand(): string;
  profileDirOf(ctx: DshHostContext): string | null;
  profileModules(dir: string | null): readonly ProfileModule[];
  readInstalledModule(dir: string | null, pkg: string): InstalledModule;
  readProfilePackage(dir: string | null, pkg: string): ProfilePackage | undefined;
  readBundleManager(ctx: DshHostContext): BundleManager | undefined;
  createRegistryNotebook(dir: string | null): RegistryNotebook;
  declarationGaps(dir: string | null): readonly { readonly pkg: string }[] | undefined;
  moduleDeclarationOf(dir: string | null, pkg: string): unknown;
  registryDeclarationOf(options: unknown): Promise<unknown>;
  pathDeclarationOf(spec: string): unknown;
  declarationRefusalOf(name: string, raw: unknown): readonly string[];
  refusalReason(): string;
  latestVersion(options: unknown): Promise<string | undefined>;
  missingReleaseParts(options: unknown): Promise<readonly string[]>;
  isNewerVersion(left: string, right: string): boolean;
  pluginInstallPlan(options: unknown): SupplyPluginSource;
  packageRouteOf(options: unknown): Promise<SupplyPackageRoute | undefined>;
  probeRelease(options: unknown): Promise<SupplyRelease | undefined>;
  resolvePluginSource(source: unknown, env: unknown, options?: unknown): SupplyPluginSource;
  splitNpmSpec(spec: string): { readonly name: string; readonly version?: string } | undefined;
  libInstallCommand(options: unknown): string;
  startSelfUpdate(request: unknown, onError: unknown): { readonly paths: { readonly script: string } };
}
