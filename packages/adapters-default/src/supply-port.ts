import type { SupplyPort } from '@dsh-workbench/shared/host';
import { cliCatalogPath, ensureLibsBinOnPath, ensureLibsOpencliPeer, isolatedHome, libInstallCommand, vendorPluginsDir } from '@dsh-workbench/adapter-runtime';
import { createRegistryNotebook, isNewerVersion, latestVersion, missingReleaseParts, probeRelease } from '@dsh-workbench/adapter-profile';
import { opencliInstallCommand, startSelfUpdate } from '@dsh-workbench/adapter-probe';
import {
  declarationGaps,
  declarationRefusalOf,
  moduleDeclarationOf,
  packageRouteOf,
  pathDeclarationOf,
  pluginInstallPlan,
  profileDirOf,
  profileModules,
  readBundleManager,
  readInstalledModule,
  readProfilePackage,
  refusalReason,
  registryDeclarationOf,
  resolvePluginSource,
  splitNpmSpec,
} from '@dsh-workbench/adapter-supply';

export function createSupplyPort(): SupplyPort {
  const port = {
    isolatedHome,
    cliCatalogPath,
    vendorPluginsDir,
    runtimeInstallCommand: opencliInstallCommand,
    afterLibInstall() {
      ensureLibsOpencliPeer();
      ensureLibsBinOnPath();
    },
    profileDirOf,
    profileModules,
    readInstalledModule,
    readProfilePackage,
    readBundleManager,
    createRegistryNotebook,
    declarationGaps,
    moduleDeclarationOf,
    registryDeclarationOf,
    pathDeclarationOf,
    declarationRefusalOf,
    refusalReason,
    latestVersion,
    missingReleaseParts,
    isNewerVersion,
    pluginInstallPlan,
    packageRouteOf,
    probeRelease,
    resolvePluginSource,
    splitNpmSpec,
    libInstallCommand,
    startSelfUpdate,
  };
  return { ...port, env: port, modules: port };
}
