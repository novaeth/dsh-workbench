import type { Seam, SelfUpdateRollbackRequest, SupplyPort } from '@dsh-workbench/shared/host';
import { nowIso } from '@dsh-workbench/shared/host';
import { cliCatalogPath, ensureLibsBinOnPath, ensureLibsOpencliPeer, isolatedHome, libInstallCommand, libUninstallCommand, vendorPluginsDir } from '@dsh-workbench/adapter-runtime';
import { isolatedRoot } from '@dsh-workbench/adapter-runtime';

import { createRegistryNotebook, isNewerVersion } from '@dsh-workbench/adapter-profile';
import { latestVersion, missingReleaseParts, probeRelease } from './release-port.js';
import { opencliInstallCommand } from './install.js';
import { recoveryCommand, selfUpdateCliFor, startSelfUpdate, type SelfUpdateRequest } from './self-update.js';
import { restartWorkbench } from './restart-workbench.js';
import { rollbackSelfUpdate } from './self-update-rollback.js';
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
import { PLUGIN_ID, readBundleManager, refusalReason } from '@dsh-workbench/shared/host';
import { OPENCLI_MANIFEST_FILE } from '@dsh-workbench/adapter-runtime';

export interface ProbeSupplyOptions {
  readonly seam?: Seam | undefined;
}

export function createSupplyPort(options: ProbeSupplyOptions = {}): SupplyPort {
  const seam = options.seam;
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
    recoveryCommand: (options: { readonly profile: string; readonly version: string }) =>
      recoveryCommand({ profile: options.profile, pkg: PLUGIN_ID, version: options.version, cli: selfUpdateCliFor(options.profile) }),
    startSelfUpdate: (request: SelfUpdateRequest, onError: (message: string) => void) =>
      startSelfUpdate(request, onError, seam),
    restartWorkbench: (onError: (message: string) => void) => restartWorkbench({ seam, onError }),
    rollbackSelfUpdate: (request: SelfUpdateRollbackRequest) => rollbackSelfUpdate(request, nowIso()),
  };
  return { ...port, env: port, modules: port };
}
