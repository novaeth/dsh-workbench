import type { SupplyPort } from '@dsh-workbench/shared/host';
import { cliCatalogPath, ensureLibsBinOnPath, ensureLibsOpencliPeer, isolatedHome, libInstallCommand, libUninstallCommand, vendorPluginsDir } from '@dsh-workbench/adapter-runtime';
import { isolatedRoot } from '@dsh-workbench/adapter-runtime';

import { createRegistryNotebook, isNewerVersion, latestVersion, missingReleaseParts, probeRelease } from '@dsh-workbench/adapter-profile';
import { opencliInstallCommand } from './install.js';
import { startSelfUpdate } from './self-update.js';
import {
  declarationGaps,
  declarationRefusalOf,
  moduleDeclarationOf,
  packageRouteOf,
  pathDeclarationOf,
  pluginInstallPlan,
  profileDirOf,
  profileModules,
  readInstalledModule,
  readProfilePackage,
  refusalReason,
  registryDeclarationOf,
  resolvePluginSource,
  splitNpmSpec,
} from '@dsh-workbench/adapter-supply';
import { readBundleManager } from '@dsh-workbench/shared/host';

export function createSupplyPort(): SupplyPort {
  const port = {
    isolatedRoot,
    isolatedHome,
    pluginPackagePrefix: () => 'opencli-plugin-',
    pluginManifestFile: () => 'opencli-plugin.json',
    cliCatalogPath,
    vendorPluginsDir,
    runtimeInstallCommand: opencliInstallCommand,
    afterLibInstall() {
      ensureLibsOpencliPeer();
      ensureLibsBinOnPath();
    },
    profileDirOf,
    profileModules,
    readBundleManager,
    readInstalledModule,
    readProfilePackage,
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
    libUninstallCommand,
    startSelfUpdate,
  };
  return { ...port, env: port, modules: port };
}
