import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InstalledModule, ProfileModule } from '@dsh-workbench/shared/host';
import type { SupplyPort } from '@dsh-workbench/shared/host';
import { createReleaseProbe } from '@dsh-workbench/shared/host';

function readJson(at: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(at, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function unitOf(dir: string, pkg: string): ProfileModule | undefined {
  const manifest = readJson(join(dir, 'node_modules', pkg, 'package.json'));
  const dsh = manifest?.['dsh'] as { workbench?: { unit?: unknown } } | undefined;
  const unit = dsh?.workbench?.unit;
  if (typeof unit !== 'string') return undefined;
  const version = typeof manifest?.['version'] === 'string' ? (manifest['version'] as string) : '0.0.0';
  return { pkg, unit, version };
}

export function fsSupply(options: {
  readonly root: () => string;
  readonly profile: () => string;
  readonly catalog: () => string | undefined;
  readonly plugins: () => string | undefined;
  readonly cliDirs?: boolean | undefined;
}): SupplyPort {
  const release = createReleaseProbe();
  const profileDirOf = (): string => options.profile();
  const packagesOf = (dir: string): readonly string[] => {
    const manifest = readJson(join(dir, 'package.json'));
    const deps = manifest?.['dependencies'];
    return deps === undefined || deps === null ? [] : Object.keys(deps as Record<string, string>);
  };
  const port = {
    libUninstallCommand: (options: { need: { name: string } }) => `npm uninstall ${options.need.name}`,
    pluginPackagePrefix: () => 'opencli-plugin-',
    pluginManifestFile: () => 'opencli-plugin.json',
    isolatedRoot: () => join(options.root(), 'workbench', 'opencli'),
    isolatedHome: () => join(options.root(), 'workbench', 'opencli', 'home'),
    ...(options.cliDirs === false
      ? {}
      : {
          cliCatalogPath: () => options.catalog() ?? join(options.root(), 'workbench', 'opencli', 'catalog.json'),
          vendorPluginsDir: () => options.plugins() ?? join(options.root(), 'workbench', 'opencli', 'plugins'),
          runtimeInstallCommand: () => 'npm i -g opencli',
        }),
    afterLibInstall: () => undefined,
    profileDirOf,
    profileModules: (dir: string | null): readonly ProfileModule[] => {
      if (dir === null || !existsSync(dir)) return [];
      return packagesOf(dir)
        .map((pkg) => unitOf(dir, pkg))
        .filter((row): row is ProfileModule => row !== undefined);
    },
    readInstalledModule: (dir: string | null, pkg: string): InstalledModule => {
      if (dir === null) return { kind: 'unknown', pkg };
      const row = unitOf(dir, pkg);
      return row === undefined
        ? { kind: 'not-module', pkg }
        : { kind: 'module', pkg, unit: row.unit, version: row.version, local: true };
    },
    readProfilePackage: (dir: string | null, pkg: string) => {
      if (dir === null) return undefined;
      const row = unitOf(dir, pkg);
      return row === undefined ? undefined : { pkg, version: row.version };
    },
    readBundleManager: () => undefined,
    createRegistryNotebook: () => ({}) as never,
    declarationGaps: () => [],
    moduleDeclarationOf: () => undefined,
    registryDeclarationOf: async () => undefined,
    pathDeclarationOf: () => undefined,
    declarationRefusalOf: () => [],
    refusalReason: () => '',
    packageRouteOf: async () => undefined,
    isNewerVersion: () => false,
    startSelfUpdate: () => ({}) as never,
    resolvePluginSource: () => ({ ok: false, problem: 'not-declared' }) as never,
    libInstallCommand: () => '',
    latestVersion: release.latestVersion,
    missingReleaseParts: release.missingReleaseParts,
    probeRelease: release.probeRelease,
    pluginInstallPlan: (plan: { spec: string; command: string }): unknown => ({
      ok: true,
      commands: [
        { line: `npm i --prefix '${join(options.root(), 'workbench', 'opencli', 'plugins-npm')}' '${plan.spec}'` },
        { line: `'${plan.command}' plugin install '${plan.spec}'` },
      ],
    }),
    splitNpmSpec: () => undefined,
  };
  return { ...port, env: port, modules: port } as SupplyPort;
}
