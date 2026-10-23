import type { DshShell } from '@dsh-workbench/shared';
import type { PluginRelease } from '@dsh-workbench/shared';
import {
  RELEASE_SIBLINGS,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '@dsh-workbench/shared/host';
import { parseJsonLoose, quoteShellArg } from '@dsh-workbench/shared/host';
import { npmCacheDir, vendorPrefix } from '@dsh-workbench/shared/host';

import { runShell } from '@dsh-workbench/shared/host';

export function parseLedgerVersion(
  stdout: string,
  name: string,
): string | undefined {
  const parsed = parseJsonLoose(stdout);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const entry = (parsed as { dependencies?: Record<string, unknown> })
    .dependencies?.[name];
  if (typeof entry !== "object" || entry === null) return undefined;
  const version = (entry as { version?: unknown }).version;
  return typeof version === "string" && /^\d+\.\d+\.\d+/.test(version.trim())
    ? version.trim()
    : undefined;
}

export function compareVersions(a: string, b: string): number | undefined {
  const na = a.split(".").map((part) => Number.parseInt(part, 10));
  const nb = b.split(".").map((part) => Number.parseInt(part, 10));
  if (na.some(Number.isNaN) || nb.some(Number.isNaN)) return undefined;
  for (let index = 0; index < Math.max(na.length, nb.length); index += 1) {
    const left = na[index] ?? 0;
    const right = nb[index] ?? 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(latest: string, installed: string): boolean {
  if (latest === installed) return false;
  const compared = compareVersions(latest, installed);
  return compared === undefined ? true : compared > 0;
}

function parseVersion(stdout: string): string | undefined {
  const value = stdout.trim();
  return /^\d+\.\d+\.\d+[^\s]*$/.test(value) ? value : undefined;
}

interface CacheEntry {
  readonly at: number;
  readonly value: string | undefined;
}

const latestCache = new Map<string, CacheEntry>();

export async function latestVersion(options: {
  shell: DshShell;
  name: string;
  registry: string;
  force?: boolean;
}): Promise<string | undefined> {
  const { shell, name, registry, force = false } = options;
  const key = `${registry}|${name}`;
  const hit = latestCache.get(key);
  if (!force && hit !== undefined && Date.now() - hit.at < VERSION_CHECK_TTL_MS)
    return hit.value;

  const result = await runShell(
    shell,
    `npm view ${quoteShellArg(name)} version --registry ${quoteShellArg(registry)} --cache ${quoteShellArg(npmCacheDir())}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS },
  ).catch(() => undefined);
  const value =
    result?.exitCode === 0 ? parseVersion(result.stdout) : undefined;
  latestCache.set(key, { at: Date.now(), value });
  return value;
}

interface ExistsEntry {
  readonly at: number;
  readonly value: boolean;
}

const existsCache = new Map<string, ExistsEntry>();

async function versionExists(options: {
  shell: DshShell;
  name: string;
  version: string;
  registry: string;
  force?: boolean;
}): Promise<boolean> {
  const { shell, name, version, registry, force = false } = options;
  const key = `${registry}|${name}@${version}`;
  const hit = existsCache.get(key);
  if (!force && hit !== undefined && (hit.value || Date.now() - hit.at < VERSION_CHECK_TTL_MS))
    return hit.value;

  const result = await runShell(
    shell,
    `npm view ${quoteShellArg(`${name}@${version}`)} version --registry ${quoteShellArg(registry)} --cache ${quoteShellArg(npmCacheDir())}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS },
  ).catch(() => undefined);
  const value = result?.exitCode === 0 && parseVersion(result.stdout) !== undefined;
  existsCache.set(key, { at: Date.now(), value });
  return value;
}

export async function missingReleaseParts(options: {
  shell: DshShell;
  registry: string;
  version: string;
  force?: boolean;
}): Promise<readonly string[]> {
  const { shell, registry, version, force = false } = options;
  const missing: string[] = [];
  for (const name of RELEASE_SIBLINGS) {
    if (!(await versionExists({ shell, name, version, registry, force }))) missing.push(name);
  }
  return missing;
}

export async function probeRelease(options: {
  shell: DshShell;
  package: string;
  registry?: string | undefined;
  force?: boolean;
}): Promise<PluginRelease | undefined> {
  const { shell, package: pkg, registry, force = false } = options;
  if (pkg === "") return undefined;

  const ledger = await runShell(
    shell,
    `npm ls --prefix ${quoteShellArg(vendorPrefix())} ${quoteShellArg(pkg)} --json --depth=0 --cache ${quoteShellArg(npmCacheDir())}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS },
  ).catch(() => undefined);
  const installed =
    ledger === undefined ? undefined : parseLedgerVersion(ledger.stdout, pkg);
  if (installed === undefined) return undefined;

  const source =
    registry === undefined || registry.trim() === ""
      ? undefined
      : registry.trim();
  const latest =
    source === undefined
      ? undefined
      : await latestVersion({ shell, name: pkg, registry: source, force });

  return {
    installed,
    ...(latest === undefined ? {} : { latest }),
  };
}

export function resetReleaseCache(): void {
  latestCache.clear();
  existsCache.clear();
}
