import type { DshShell, ResolvedPluginSource, SupplySource } from '@dsh-workbench/shared';
import type { PackageRoute } from '@dsh-workbench/shared/host';
import { createPackageRouter, localDirOf, splitNpmSpec } from '@dsh-workbench/shared/host';
import { npmCacheDir, OPENCLI_MANIFEST_FILE } from '@dsh-workbench/adapter-runtime';
import { registryDshOf } from './registry-declaration.js';
import { resolvePluginSource } from './plugin-source.js';

export const LOCAL_PLUGIN_ENV = 'DSH_WB_OPENCLI_PLUGIN_PATH';
export const PLUGIN_REGISTRY_ENV = 'DSH_WB_OPENCLI_PLUGIN_REGISTRY';

const router = createPackageRouter({
  manifestFile: OPENCLI_MANIFEST_FILE,
  cacheDir: npmCacheDir(),
  dshLookup: (options) => registryDshOf(options),
});

export async function packageRouteOf(options: {
  readonly spec: string;
  readonly shell?: DshShell | undefined;
  readonly registry?: string | undefined;
  readonly force?: boolean;
}): Promise<PackageRoute | undefined> {
  return router.packageRouteOf(options);
}

export function resetPackageRouteCache(): void {
  router.reset();
}

export function pluginInstallPlan(options: {
  readonly spec: string;
  readonly command: string;
  readonly registry?: string | undefined;
  readonly pluginName?: string | undefined;
}): ResolvedPluginSource {
  const local = localDirOf(options.spec);
  if (local !== undefined) {
    return resolvePluginSource(
      { kind: 'local', env: LOCAL_PLUGIN_ENV },
      { [LOCAL_PLUGIN_ENV]: local },
      { command: options.command },
    );
  }
  const ref = splitNpmSpec(options.spec);
  if (ref === undefined) return { ok: false, problem: 'malformed' };
  const source: SupplySource = {
    kind: 'npm',
    package: ref.name,
    registryEnv: PLUGIN_REGISTRY_ENV,
    ...(options.registry === undefined ? {} : { registryDefault: options.registry }),
  };
  return resolvePluginSource(
    source,
    { [PLUGIN_REGISTRY_ENV]: options.registry },
    {
      command: options.command,
      ...(options.pluginName === undefined ? {} : { plugin: options.pluginName }),
      ...(ref.version === undefined ? {} : { version: ref.version }),
      mode: 'install',
    },
  );
}
