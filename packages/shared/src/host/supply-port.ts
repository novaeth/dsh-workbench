import type { DshHostContext } from '../api/dsh.js';
import { adaptersOf } from './adapters.js';
import type { SupplyPort } from './port-types.js';
export type { SupplyPort } from './port-types.js';


export function supplyPortOf(ctx: DshHostContext): SupplyPort {
  const set = adaptersOf(ctx);
  const env = set.supply;
  const modules = set.modules;
  const pluginPackagePrefix = modules.pluginPackagePrefix;
  const pluginManifestFile = modules.pluginManifestFile;
  const cliCatalogPath = modules.cliCatalogPath;
  const vendorPluginsDir = modules.vendorPluginsDir;
  const runtimeInstallCommand = modules.runtimeInstallCommand;
  return {
    env,
    modules,
    resolvePluginSource: (source, environment, options) => env.resolvePluginSource(source, environment, options),
    libInstallCommand: (options) => env.libInstallCommand(options),
    libUninstallCommand: (options) => env.libUninstallCommand(options),
    pluginInstallPlan: (options) => env.pluginInstallPlan(options),
    latestVersion: (options) => env.latestVersion(options),
    missingReleaseParts: (options) => env.missingReleaseParts(options),
    probeRelease: (options) => env.probeRelease(options),
    splitNpmSpec: (spec) => env.splitNpmSpec(spec),
    isolatedRoot: () => modules.isolatedRoot(),
    isolatedHome: () => modules.isolatedHome(),
    ...(pluginPackagePrefix === undefined ? {} : { pluginPackagePrefix: () => pluginPackagePrefix() }),
    ...(pluginManifestFile === undefined ? {} : { pluginManifestFile: () => pluginManifestFile() }),
    ...(cliCatalogPath === undefined ? {} : { cliCatalogPath: () => cliCatalogPath() }),
    ...(vendorPluginsDir === undefined ? {} : { vendorPluginsDir: () => vendorPluginsDir() }),
    ...(runtimeInstallCommand === undefined ? {} : { runtimeInstallCommand: () => runtimeInstallCommand() }),
    afterLibInstall: () => modules.afterLibInstall(),
    profileDirOf: (context) => modules.profileDirOf(context),
    profileModules: (dir) => modules.profileModules(dir),
    readInstalledModule: (dir, pkg) => modules.readInstalledModule(dir, pkg),
    readProfilePackage: (dir, pkg) => modules.readProfilePackage(dir, pkg),
    readBundleManager: (context) => modules.readBundleManager(context),
    createRegistryNotebook: (dir) => modules.createRegistryNotebook(dir),
    declarationGaps: (dir) => modules.declarationGaps(dir),
    moduleDeclarationOf: (dir, pkg) => modules.moduleDeclarationOf(dir, pkg),
    registryDeclarationOf: (options) => modules.registryDeclarationOf(options),
    pathDeclarationOf: (spec) => modules.pathDeclarationOf(spec),
    declarationRefusalOf: (name, raw) => modules.declarationRefusalOf(name, raw),
    refusalReason: () => modules.refusalReason(),
    packageRouteOf: (options) => modules.packageRouteOf(options),
    isNewerVersion: (left, right) => modules.isNewerVersion(left, right),
    startSelfUpdate: (request, onError) => modules.startSelfUpdate(request, onError),
  };
}

export function requireSupply(): SupplyPort {
  throw new Error('workbenchSupply 未提供');
}
