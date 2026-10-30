import type { DshShell } from '../api/dsh.js';
import type { PluginRelease } from '../contract/unit.js';

import { RELEASE_PACKAGES } from './release-packages.generated.js';
import { VERSION_CHECK_TIMEOUT_MS, VERSION_CHECK_TTL_MS } from '../config/constants.js';
import { isValidVersion } from './version.js';
import { parseJsonLoose } from '../lib/text.js';
import { quoteShellArg } from './shell-text.js';
import { runShell } from './shell.js';

function cacheFlag(cacheDir: string | undefined): string {
  return cacheDir === undefined ? '' : ` --cache ${quoteShellArg(cacheDir)}`;
}

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

function parseVersion(stdout: string): string | undefined {
  const value = stdout.trim();
  return isValidVersion(value) ? value : undefined;
}

interface CacheEntry {
  readonly at: number;
  readonly value: string | undefined;
}


export interface ReleaseProbe {
  latestVersion(options: LatestVersionOptions): Promise<string | undefined>;
  missingReleaseParts(options: MissingPartsOptions): Promise<readonly string[]>;
  probeRelease(options: ProbeReleaseOptions): Promise<PluginRelease | undefined>;
  reset(): void;
}

export function createReleaseProbe(): ReleaseProbe {
  const latestCache = new Map<string, CacheEntry>();
  const existsCache = new Map<string, ExistsEntry>();

  return {
    latestVersion: async (options) => latestVersionOf(latestCache, options),
    missingReleaseParts: async (options) => missingPartsOf(latestCache, existsCache, options),
    probeRelease: async (options) => probeOf(latestCache, options),
    reset: () => {
      latestCache.clear();
      existsCache.clear();
    },
  };
}

interface LatestVersionOptions {
  readonly shell: DshShell;
  readonly name: string;
  readonly registry: string;
  readonly force?: boolean;
  readonly cacheDir?: string | undefined;
}

interface MissingPartsOptions {
  readonly shell: DshShell;
  readonly name: string;
  readonly registry: string;
  readonly version: string;
  readonly force?: boolean;
  readonly cacheDir?: string | undefined;
}

interface ProbeReleaseOptions {
  readonly shell: DshShell;
  readonly package: string;
  readonly registry?: string | undefined;
  readonly force?: boolean;
  readonly check?: boolean;
  readonly cacheDir?: string | undefined;
  readonly prefix?: string | undefined;
}

async function latestVersionOf(latestCache: Map<string, CacheEntry>, options: {
  shell: DshShell;
  name: string;
  registry: string;
  force?: boolean;
  cacheDir?: string | undefined;
}): Promise<string | undefined> {
  const { shell, name, registry, force = false, cacheDir } = options;
  const key = `${registry}|${name}`;
  const hit = latestCache.get(key);
  if (!force && hit !== undefined && Date.now() - hit.at < VERSION_CHECK_TTL_MS)
    return hit.value;

  const result = await runShell(
    shell,
    `npm view ${quoteShellArg(name)} version --registry ${quoteShellArg(registry)}${cacheFlag(cacheDir)}`,
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


async function versionExists(
  existsCache: Map<string, ExistsEntry>,
  options: {
  shell: DshShell;
  name: string;
  version: string;
  registry: string;
  force?: boolean;
  cacheDir?: string | undefined;
}): Promise<boolean> {
  const { shell, name, version, registry, force = false, cacheDir } = options;
  const key = `${registry}|${name}@${version}`;
  const hit = existsCache.get(key);
  if (!force && hit !== undefined && (hit.value || Date.now() - hit.at < VERSION_CHECK_TTL_MS))
    return hit.value;

  const result = await runShell(
    shell,
    `npm view ${quoteShellArg(`${name}@${version}`)} version --registry ${quoteShellArg(registry)}${cacheFlag(cacheDir)}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS },
  ).catch(() => undefined);
  const value = result?.exitCode === 0 && parseVersion(result.stdout) !== undefined;
  existsCache.set(key, { at: Date.now(), value });
  return value;
}

async function missingPartsOf(
  latestCache: Map<string, CacheEntry>,
  existsCache: Map<string, ExistsEntry>,
  options: {
  shell: DshShell;
  name: string;
  registry: string;
  version: string;
  force?: boolean;
  cacheDir?: string | undefined;
}): Promise<readonly string[]> {
  const { shell, name, registry, version, force = false, cacheDir } = options;
  const checked = await Promise.all(
    RELEASE_PACKAGES.filter((part) => part !== name).map(async (part) => ({
      part,
      present: await versionExists(existsCache, { shell, name: part, version, registry, force, cacheDir }),
    })),
  );
  return checked.filter((entry) => !entry.present).map((entry) => entry.part);
}

async function probeOf(
  latestCache: Map<string, CacheEntry>,
  options: {
  shell: DshShell;
  package: string;
  registry?: string | undefined;
  force?: boolean;
  check?: boolean;
  cacheDir?: string | undefined;
  prefix?: string | undefined;
}): Promise<PluginRelease | undefined> {
  const { shell, package: pkg, registry, force = false, check = true, cacheDir, prefix } = options;
  if (pkg === "") return undefined;

  const ledger = await runShell(
    shell,
    `npm ls --prefix ${quoteShellArg(prefix ?? '')} ${quoteShellArg(pkg)} --json --depth=0${cacheFlag(cacheDir)}`,
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
    source === undefined || !check
      ? undefined
      : await latestVersionOf(latestCache, { shell, name: pkg, registry: source, force, cacheDir });

  return {
    installed,
    ...(latest === undefined ? {} : { latest }),
  };
}


