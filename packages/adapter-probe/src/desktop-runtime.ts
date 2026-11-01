import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { inheritedEnvOf, pathWithBinsOf } from '@dsh-workbench/shared/host';
import { hostSurface } from './platform.js';

export interface PnpmProcess {
  readonly versions: { readonly electron?: string | undefined; readonly node?: string | undefined };
  readonly resourcesPath?: string | undefined;
}

export function desktopResourcesDir(proc: PnpmProcess = process): string | undefined {
  if (hostSurface({ proc }).deployment !== 'desktop') return undefined;
  const declared = proc.resourcesPath;
  return declared === undefined || declared === '' ? undefined : declared;
}

export function desktopPnpmPath(
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  const resources = desktopResourcesDir(proc);
  if (resources === undefined) return undefined;
  const path = join(resources, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs');
  return exists(path) ? path : undefined;
}

export function desktopBundledBins(
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
): readonly string[] {
  const resources = desktopResourcesDir(proc);
  if (resources === undefined) return [];
  const dependencies = join(resources, 'runtime', 'primary-runtime', 'dependencies');
  return [join(dependencies, 'node', 'bin'), join(dependencies, 'pnpm', 'bin')].filter((dir) => exists(dir));
}

export function desktopNodeExecutable(
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  const resources = desktopResourcesDir(proc);
  if (resources === undefined) return undefined;
  const bin = join(resources, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin');
  return ['node.exe', 'node'].map((name) => join(bin, name)).find((path) => exists(path));
}

export function desktopRuntimeEnvPath(
  parentPath: string | undefined,
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
  separator: string = delimiter,
): string | undefined {
  const bins = desktopBundledBins(proc, exists);
  if (bins.length === 0) return undefined;
  const parts = (parentPath ?? '').split(separator).filter((part) => part !== '' && !bins.includes(part));
  return [...bins, ...parts].join(separator);
}

export function desktopRuntimeEnv(
  parent: NodeJS.ProcessEnv = process.env,
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
): Record<string, string> {
  const bins = desktopBundledBins(proc, exists);
  if (bins.length === 0) return {};
  return { ...inheritedEnvOf(parent), PATH: pathWithBinsOf(parent.PATH, bins) };
}

export function desktopPnpmVersion(proc: PnpmProcess = process, exists: (path: string) => boolean = existsSync): string | undefined {
  const resources = desktopResourcesDir(proc);
  if (resources === undefined) return undefined;
  const manifest = join(resources, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'package.json');
  if (!exists(manifest)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

