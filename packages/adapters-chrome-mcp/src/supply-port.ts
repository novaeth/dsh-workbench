import type { BinNeed, LibNeed, SupplyPort } from '@dsh-workbench/shared/host';
import type { HostOs } from '@dsh-workbench/shared';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import type { NpmSource } from '@dsh-workbench/shared/host';
import {
  binInstallCommand,
  libInstallCommand,
  libUninstallCommand,
  readBundleManager,
  refusalReason,
  runtimeLayoutOf,
} from '@dsh-workbench/shared/host';
import { createRegistryNotebook, isNewerVersion, latestVersion, missingReleaseParts, probeRelease } from '@dsh-workbench/adapter-profile';
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

export const CHROME_MCP_RUNTIME_ID = 'chrome-mcp';

const layout = runtimeLayoutOf(CHROME_MCP_RUNTIME_ID);

export function createSupplyPort(): SupplyPort {
  const port = {
    isolatedRoot: () => layout.root,
    isolatedHome: () => layout.home,
    afterLibInstall: () => undefined,
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
    libInstallCommand: (options: { need: LibNeed; source: NpmSource; version?: string; env?: NodeJS.ProcessEnv }) =>
      libInstallCommand({ ...options, prefix: layout.libsPrefix }),
    libUninstallCommand: (options: { need: LibNeed }) => libUninstallCommand({ need: options.need, prefix: layout.libsPrefix }),
    binInstallCommand: (need: BinNeed, os: HostOs, env?: NodeJS.ProcessEnv) =>
      binInstallCommand(need, os, env ?? process.env, layout.libsPrefix),
    startSelfUpdate: (request: SelfUpdateRequest) => ({
      started: false,
      paths: {
        dir: `${request.dshHome}/self-update`,
        script: '',
        marker: '',
        log: '',
      },
      forward: '',
    }),
  };
  return { ...port, env: port, modules: port };
}
