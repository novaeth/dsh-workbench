import type { DshShell } from '@dsh-workbench/shared';
import type { PluginRelease } from '@dsh-workbench/shared';
import {
  RELEASE_PACKAGES,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '@dsh-workbench/shared/host';
import { isValidVersion, parseJsonLoose, quoteShellArg } from '@dsh-workbench/shared/host';
import { npmCacheDir, vendorPrefix } from '@dsh-workbench/adapter-runtime';

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
  return typeof version === "string" && isValidVersion(version.trim())
    ? version.trim()
    : undefined;
}

export { compareVersions, isNewerVersion } from '@dsh-workbench/shared/host';

function parseVersion(stdout: string): string | undefined {
  const value = stdout.trim();
  return isValidVersion(value) ? value : undefined;
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
  const read = result?.exitCode === 0 ? parseVersion(result.stdout) : undefined;
  latestCache.set(key, { at: Date.now(), value: read });
  return read;
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
  name: string;
  registry: string;
  version: string;
  force?: boolean;
}): Promise<readonly string[]> {
  const { shell, name, registry, version, force = false } = options;
  const checked = await Promise.all(
    RELEASE_PACKAGES.filter((part) => part !== name).map(async (part) => ({
      part,
      present: await versionExists({ shell, name: part, version, registry, force }),
    })),
  );
  return checked.filter((entry) => !entry.present).map((entry) => entry.part);
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
