import type { DshShell } from '../api/dsh.js';
import { VERSION_CHECK_TTL_MS } from '../config/constants.js';
import { dshMarkersOf, splitNpmSpec, verdictOf, type PackageVerdict } from './package-kind.js';
import { withPackageDir } from './package-content.js';
import { localDirOf } from './local-declaration.js';

export type PackageRouteKind = 'runtime-plugin' | 'dsh-bundle' | 'neither';

export interface PackageRoute {
  readonly kind: PackageRouteKind;
  readonly pkg?: string;
  readonly pluginName?: string;
}

function routeOfVerdict(verdict: PackageVerdict, fallback?: string): PackageRoute {
  const pkg = verdict.pkg ?? fallback;
  if (verdict.kind === 'neither') return { kind: 'neither', ...(pkg === undefined ? {} : { pkg }) };
  if (verdict.kind === 'dsh-bundle' || verdict.kind === 'both') return { kind: 'dsh-bundle' };
  return {
    kind: 'runtime-plugin',
    ...(pkg === undefined ? {} : { pkg }),
    ...(verdict.pluginName === undefined ? {} : { pluginName: verdict.pluginName }),
  };
}

export interface PackageRouter {
  packageRouteOf(options: RouteOptions): Promise<PackageRoute | undefined>;
  reset(): void;
}

interface RouteOptions {
  readonly spec: string;
  readonly shell?: DshShell | undefined;
  readonly registry?: string | undefined;
  readonly force?: boolean;
}

export interface PackageRouterOptions {
  readonly manifestFile: string;
  readonly cacheDir?: string | undefined;
  readonly dshLookup?: ((options: { shell: DshShell; name: string; registry: string }) => Promise<{ readable: boolean; raw: unknown }>) | undefined;
}

export function createPackageRouter(options: PackageRouterOptions): PackageRouter {
  const cache = new Map<string, { at: number; route: PackageRoute | null }>();
  return {
    packageRouteOf: (routeOptions) => routeOf(cache, options, routeOptions),
    reset: () => {
      cache.clear();
    },
  };
}

async function routeOf(
  cache: Map<string, { at: number; route: PackageRoute | null }>,
  options: PackageRouterOptions,
  routeOptions: RouteOptions,
): Promise<PackageRoute | undefined> {
  const local = localDirOf(routeOptions.spec);
  if (local !== undefined) {
    const verdict = verdictOf(local, options.manifestFile);
    return verdict === undefined ? undefined : routeOfVerdict(verdict, splitNpmSpec(routeOptions.spec)?.name);
  }

  const ref = splitNpmSpec(routeOptions.spec);
  if (ref === undefined) return undefined;
  const shell = routeOptions.shell;
  const registry = routeOptions.registry;
  if (shell === undefined || registry === undefined) return undefined;

  const key = `${registry}|${routeOptions.spec}`;
  const hit = cache.get(key);
  if (routeOptions.force !== true && hit !== undefined && Date.now() - hit.at < VERSION_CHECK_TTL_MS) {
    return hit.route ?? undefined;
  }

  const found =
    options.dshLookup === undefined
      ? { readable: false, raw: undefined }
      : await options.dshLookup({ shell, name: routeOptions.spec, registry });
  let route: PackageRoute | undefined;
  if (found.readable && dshMarkersOf(found.raw)) {
    route = { kind: 'dsh-bundle' };
  } else {
    const verdict = await withPackageDir(
      { shell, spec: routeOptions.spec, registry, ...(options.cacheDir === undefined ? {} : { cacheDir: options.cacheDir }) },
      (dir) => verdictOf(dir, options.manifestFile),
    );
    route = verdict === undefined ? undefined : routeOfVerdict(verdict, ref.name);
  }
  cache.set(key, { at: Date.now(), route: route ?? null });
  return route;
}
