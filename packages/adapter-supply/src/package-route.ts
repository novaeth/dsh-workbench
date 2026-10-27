import type { DshShell, SupplySource } from '@dsh-workbench/shared';
import { VERSION_CHECK_TTL_MS } from '@dsh-workbench/shared/host';
import { resolvePluginSource, type ResolvedPluginSource } from './plugin-source.js';
import { dshMarkersOf, splitNpmSpec, verdictOf, type PackageVerdict } from './package-kind.js';
import { withPackageDir } from './package-content.js';
import { localDirOf, registryDshOf } from './registry-declaration.js';

export type PackageRouteKind = 'opencli-plugin' | 'dsh-bundle' | 'neither';

export interface PackageRoute {
  readonly kind: PackageRouteKind;
  readonly pkg?: string;
  readonly pluginName?: string;
}

export const LOCAL_PLUGIN_ENV = 'DSH_WB_OPENCLI_PLUGIN_PATH';
export const PLUGIN_REGISTRY_ENV = 'DSH_WB_OPENCLI_PLUGIN_REGISTRY';

const cache = new Map<string, { at: number; route: PackageRoute | null }>();

function routeOfVerdict(verdict: PackageVerdict, fallback?: string): PackageRoute {
  const pkg = verdict.pkg ?? fallback;
  if (verdict.kind === 'neither') return { kind: 'neither', ...(pkg === undefined ? {} : { pkg }) };
  if (verdict.kind === 'dsh-bundle' || verdict.kind === 'both') return { kind: 'dsh-bundle' };
  return {
    kind: 'opencli-plugin',
    ...(pkg === undefined ? {} : { pkg }),
    ...(verdict.pluginName === undefined ? {} : { pluginName: verdict.pluginName }),
  };
}

export async function packageRouteOf(options: {
  readonly spec: string;
  readonly shell?: DshShell | undefined;
  readonly registry?: string | undefined;
  readonly force?: boolean;
}): Promise<PackageRoute | undefined> {
  const local = localDirOf(options.spec);
  if (local !== undefined) {
    const verdict = verdictOf(local);
    return verdict === undefined ? undefined : routeOfVerdict(verdict, splitNpmSpec(options.spec)?.name);
  }

  const ref = splitNpmSpec(options.spec);
  if (ref === undefined) return undefined;
  const shell = options.shell;
  const registry = options.registry;
  if (shell === undefined || registry === undefined) return undefined;

  const key = `${registry}|${options.spec}`;
  const hit = cache.get(key);
  if (options.force !== true && hit !== undefined && Date.now() - hit.at < VERSION_CHECK_TTL_MS) {
    return hit.route ?? undefined;
  }

  const found = await registryDshOf({ shell, name: options.spec, registry });
  let route: PackageRoute | undefined;
  if (found.readable && dshMarkersOf(found.raw)) {
    route = { kind: 'dsh-bundle' };
  } else {
    const verdict = await withPackageDir({ shell, spec: options.spec, registry }, (dir) => verdictOf(dir));
    route = verdict === undefined ? undefined : routeOfVerdict(verdict, ref.name);
  }
  cache.set(key, { at: Date.now(), route: route ?? null });
  return route;
}

export function resetPackageRouteCache(): void {
  cache.clear();
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
