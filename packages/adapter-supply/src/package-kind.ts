import fs from 'node:fs';
import path from 'node:path';
import { isPackageName } from './installed-module.js';
import { dshRecordOf, packageManifestOf, packageNameOf } from './registry-declaration.js';

export type PackageKind = 'runtime-plugin' | 'dsh-bundle' | 'both' | 'neither';

export interface PackageVerdict {
  readonly kind: PackageKind;
  readonly pkg?: string;
  readonly pluginName?: string;
}

export interface NpmRef {
  readonly name: string;
  readonly version?: string;
}

import { OPENCLI_MANIFEST_FILE } from '@dsh-workbench/shared/host';

export { OPENCLI_MANIFEST_FILE };

const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/;

export function splitNpmSpec(spec: string): NpmRef | undefined {
  const value = spec.trim();
  const at = value.lastIndexOf('@');
  const name = at > 0 ? value.slice(0, at) : value;
  const version = at > 0 ? value.slice(at + 1) : '';
  if (!isPackageName(name)) return undefined;
  if (version !== '' && !VERSION.test(version)) return undefined;
  return { name, ...(version === '' ? {} : { version }) };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

export function isCommandFile(name: string): boolean {
  if (name.endsWith('.d.ts') || name.endsWith('.test.ts')) return false;
  if (name.endsWith('.d.js')) return false;
  return name.endsWith('.ts') || name.endsWith('.js');
}

export function pluginManifestOf(dir: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, OPENCLI_MANIFEST_FILE), 'utf8'));
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

export function pluginAt(dir: string): { readonly name?: string } | undefined {
  const manifest = pluginManifestOf(dir);
  if (manifest === undefined || !hasCommandFile(dir)) return undefined;
  const name = manifest.name;
  return typeof name === 'string' && name.trim() !== '' ? { name: name.trim() } : {};
}

export function dshMarkersOf(raw: unknown): boolean {
  const record = asRecord(raw);
  return record !== undefined && ('bundle' in record || 'workbench' in record);
}

export function verdictOf(dir: string): PackageVerdict | undefined {
  const plugin = pluginAt(dir);
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

export function refusalReason(): string {
  return '这个包既不是工作台的模块，也不是 opencli 的插件，装了也用不上';
}
