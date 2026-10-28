import type { SupplyPort } from '@dsh-workbench/shared/host';
import { isolatedRoot } from '@dsh-workbench/shared/host';
import { cliCatalogPath, isolatedHome, libInstallCommand, vendorPluginsDir } from '@dsh-workbench/adapter-runtime';
import { createRegistryNotebook, isNewerVersion, latestVersion, missingReleaseParts, probeRelease } from '@dsh-workbench/adapter-profile';
import { startSelfUpdate } from '@dsh-workbench/adapter-probe';
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
import { CHROME_MCP_INSTALL } from './runtime-port.js';

export function createSupplyPort(): SupplyPort {
  const port = {
    isolatedRoot,
    isolatedHome,
    cliCatalogPath,
    vendorPluginsDir,
    runtimeInstallCommand: () => CHROME_MCP_INSTALL,
    afterLibInstall: () => undefined,
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
