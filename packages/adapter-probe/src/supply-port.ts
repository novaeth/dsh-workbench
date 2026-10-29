import type { SupplyPort } from '@dsh-workbench/shared/host';
import { cliCatalogPath, ensureLibsBinOnPath, ensureLibsOpencliPeer, isolatedHome, libInstallCommand, libUninstallCommand, vendorPluginsDir } from '@dsh-workbench/adapter-runtime';
import { isolatedRoot } from '@dsh-workbench/adapter-runtime';

import { createRegistryNotebook, isNewerVersion } from '@dsh-workbench/adapter-profile';
import { latestVersion, missingReleaseParts, probeRelease } from './release-port.js';
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
  registryDeclarationOf,
  resolvePluginSource,
  splitNpmSpec,
} from '@dsh-workbench/adapter-supply';
import { readBundleManager, refusalReason } from '@dsh-workbench/shared/host';
import { OPENCLI_MANIFEST_FILE } from '@dsh-workbench/adapter-runtime';

export function createSupplyPort(): SupplyPort {
  const port = {
    isolatedRoot,
    isolatedHome,
    pluginPackagePrefix: () => 'opencli-plugin-',
    pluginManifestFile: () => OPENCLI_MANIFEST_FILE,
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
    refusalReason,
    readInstalledModule,
    readProfilePackage,
      createRegistryNotebook,
    declarationGaps,
    moduleDeclarationOf,
    registryDeclarationOf,
    pathDeclarationOf,
    declarationRefusalOf,
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
