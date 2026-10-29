import type { BinNeed, LibNeed, SupplyPort } from '@dsh-workbench/shared/host';
import type { HostOs } from '@dsh-workbench/shared';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import {
  binInstallCommand,
  createRegistryLookup,
  createReleaseProbe,
  declarationGaps,
  declarationRefusalOf,
  isNewerVersion,
  libInstallCommand,
  libUninstallCommand,
  moduleDeclarationOf,
  pathDeclarationOf,
  profileDirOf,
  profileModules,
  readBundleManager,
  readInstalledModule,
  readProfilePackage,
  refusalReason,
  runtimeLayoutOf,
  splitNpmSpec,
} from '@dsh-workbench/shared/host';
import type { NpmSource } from '@dsh-workbench/shared/host';

export const CHROME_MCP_RUNTIME_ID = 'chrome-mcp';

const layout = runtimeLayoutOf(CHROME_MCP_RUNTIME_ID);
const release = createReleaseProbe();
const registry = createRegistryLookup();

const NO_PLUGINS = { ok: false, problem: 'not-declared' } as const;

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
    createRegistryNotebook: (_dir: string | null) => ({
      sources: () => [],
      remember: () => [],
    }),
    declarationGaps,
    moduleDeclarationOf,
    registryDeclarationOf: registry.registryDeclarationOf,
    pathDeclarationOf,
    declarationRefusalOf,
    latestVersion: release.latestVersion,
    missingReleaseParts: release.missingReleaseParts,
    probeRelease: release.probeRelease,
    isNewerVersion,
    resolvePluginSource: () => NO_PLUGINS,
    pluginInstallPlan: () => NO_PLUGINS,
    packageRouteOf: async () => undefined,
    splitNpmSpec,
    libInstallCommand: (options: { need: LibNeed; source: NpmSource; version?: string; env?: NodeJS.ProcessEnv }) =>
      libInstallCommand({ ...options, prefix: layout.libsPrefix }),
    libUninstallCommand: (options: { need: LibNeed }) =>
      libUninstallCommand({ need: options.need, prefix: layout.libsPrefix }),
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
