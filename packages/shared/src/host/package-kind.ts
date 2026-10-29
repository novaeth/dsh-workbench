import fs from 'node:fs';
import path from 'node:path';
export { splitNpmSpec } from './spec.js';
export type { NpmRef } from './spec.js';
import { dshRecordOf, packageManifestOf, packageNameOf } from './local-declaration.js';
import { pluginAt } from './plugin.js';

export type PackageKind = 'runtime-plugin' | 'dsh-bundle' | 'both' | 'neither';

export interface PackageVerdict {
  readonly kind: PackageKind;
  readonly pkg?: string;
  readonly pluginName?: string;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

export function isCommandFile(name: string): boolean {
  if (name.endsWith('.d.ts') || name.endsWith('.test.ts')) return false;
  if (name.endsWith('.d.js')) return false;
  return name.endsWith('.ts') || name.endsWith('.js');
}

export function pluginManifestOf(dir: string, manifestFile: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, manifestFile), 'utf8'));
    if (Array.isArray(parsed)) return undefined;
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

export function hasCommandFile(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some(isCommandFile);
  } catch {
    return false;
  }
}

export function dshMarkersOf(raw: unknown): boolean {
  const record = asRecord(raw);
  return record !== undefined && ('bundle' in record || 'workbench' in record);
}

export function verdictOf(dir: string, manifestFile: string): PackageVerdict | undefined {
  const plugin = pluginAt(dir, manifestFile);
  if (packageManifestOf(dir) === undefined && plugin === undefined) return undefined;
  const dsh = dshMarkersOf(dshRecordOf(dir));
  const kind: PackageKind =
    plugin !== undefined && dsh ? 'both' : plugin !== undefined ? 'runtime-plugin' : dsh ? 'dsh-bundle' : 'neither';
  const pkg = packageNameOf(dir);
  return {
    kind,
    ...(pkg === undefined ? {} : { pkg }),
    ...(plugin?.name === undefined ? {} : { pluginName: plugin.name }),
  };
}


