import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const OPENCLI_MANIFEST_FILE = 'opencli-plugin.json';

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function isCommandFile(name: string): boolean {
  if (name.endsWith('.d.ts') || name.endsWith('.test.ts')) return false;
  if (name.endsWith('.d.js')) return false;
  return name.endsWith('.ts') || name.endsWith('.js');
}

function pluginManifestOf(dir: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, OPENCLI_MANIFEST_FILE), 'utf8'));
    if (Array.isArray(parsed)) return undefined;
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

function hasCommandFile(dir: string): boolean {
  try {
    return readdirSync(dir).some(isCommandFile);
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
