import fs from 'node:fs';
import path from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import {
  declarationProblemsOf,
  npmCacheDir,
  parseJsonLoose,
  quoteShellArg,
  runShell,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '@dsh-workbench/shared/host';

const cache = new Map<string, { at: number; raw: unknown }>();

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

export function localDirOf(spec: string): string | undefined {
  const dir = spec.trim().replace(/^(?:file|link):/, '');
  return path.isAbsolute(dir) ? dir : undefined;
}

export function packageManifestOf(dir: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

export function dshRecordOf(dir: string): unknown | undefined {
  return packageManifestOf(dir)?.dsh;
}

export function packageNameOf(dir: string): string | undefined {
  const name = packageManifestOf(dir)?.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
}

export function pathDeclarationOf(spec: string): unknown | undefined {
  const dir = localDirOf(spec);
  return dir === undefined ? undefined : asRecord(dshRecordOf(dir))?.workbench;
}

export interface RegistryDshLookup {
  readonly readable: boolean;
  readonly raw: unknown;
}

export async function registryDshOf(options: {
  shell: DshShell;
  name: string;
  registry?: string | undefined;
  force?: boolean;
}): Promise<RegistryDshLookup> {
  const { shell, name, registry, force = false } = options;
  const key = `${registry ?? ''}|${name}`;
  const hit = cache.get(key);
  if (!force && hit !== undefined && Date.now() - hit.at < VERSION_CHECK_TTL_MS) {
    return { readable: true, raw: hit.raw };
  }

  const at = registry === undefined ? '' : ` --registry ${quoteShellArg(registry)}`;
  const result = await runShell(
    shell,
    `npm view ${quoteShellArg(name)} dsh --json${at} --cache ${quoteShellArg(npmCacheDir())}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS },
  ).catch(() => undefined);
  const parsed = result?.exitCode === 0 ? parseJsonLoose(result.stdout) : undefined;
  if (parsed === undefined) return { readable: false, raw: undefined };
  cache.set(key, { at: Date.now(), raw: parsed });
  return { readable: true, raw: parsed };
}

export async function registryDeclarationOf(options: {
  shell: DshShell;
  name: string;
  registry: string;
  force?: boolean;
}): Promise<unknown | undefined> {
  const found = await registryDshOf(options);
  return found.readable ? asRecord(found.raw)?.workbench : undefined;
}

export function declarationRefusalOf(name: string, raw: unknown): readonly string[] {
  if (raw === undefined) return [];
  return declarationProblemsOf(name, raw);
}
