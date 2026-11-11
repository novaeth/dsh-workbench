import { now } from './time.js';
import type { Seam } from './seam/run.js';
import { productWrite } from './seam/intent.js';
import type { PluginRelease } from '../contract/unit.js';

import { RELEASE_PACKAGES } from './release-packages.generated.js';
import {
  LEDGER_READ_TIMEOUT_MS,
  VERSION_CHECK_FAILURE_TTL_MS,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '../config/constants.js';
import { compareVersions, isValidVersion } from './version.js';
import { parseJsonLoose } from '../lib/text.js';
import { quoteShellArg } from './shell-text.js';

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

function parseNewestVersion(stdout: string, includePrerelease: boolean): string | undefined {
  if (!includePrerelease) return parseVersion(stdout);
  const parsed = parseJsonLoose(stdout);
  const list = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? [parsed] : [];
  return list
    .filter((value): value is string => typeof value === 'string' && isValidVersion(value))
    .map((value) => value.trim())
    .sort((left, right) => (compareVersions(right, left) ?? 0))[0];
}

interface CacheEntry {
  readonly at: number;
  readonly value: string | undefined;
}

function versionCacheTtl(value: string | undefined): number {
  return value === undefined ? VERSION_CHECK_FAILURE_TTL_MS : VERSION_CHECK_TTL_MS;
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
  readonly seam: Seam;
  readonly name: string;
  readonly registry: string;
  readonly force?: boolean;
  readonly includePrerelease?: boolean;
  readonly cacheDir?: string | undefined;
}

interface MissingPartsOptions {
  readonly seam: Seam;
  readonly name: string;
  readonly registry: string;
  readonly version: string;
  readonly force?: boolean;
  readonly cacheDir?: string | undefined;
}

interface ProbeReleaseOptions {
  readonly seam: Seam;
  readonly package: string;
  readonly registry?: string | undefined;
  readonly force?: boolean;
  readonly check?: boolean;
  readonly includePrerelease?: boolean;
  readonly cacheDir?: string | undefined;
  readonly prefix?: string | undefined;
}

function viewCommandOf(input: {
  readonly name: string;
  readonly registry: string;
  readonly includePrerelease: boolean;
  readonly cacheDir?: string | undefined;
}): readonly string[] {
  const target = input.includePrerelease
    ? `${quoteShellArg(input.name)} versions --json`
    : `${quoteShellArg(input.name)} version`;
  const tail = `--registry ${quoteShellArg(input.registry)}${cacheFlag(input.cacheDir)}`;
  const pnpm = process.env.DSH_WB_PNPM?.trim() ?? '';
  return [`npm view ${target} ${tail}`, `${pnpm === '' ? 'pnpm' : pnpm} view ${target} ${tail}`];
}

async function latestVersionOf(latestCache: Map<string, CacheEntry>, options: {
  seam: Seam;
  name: string;
  registry: string;
  force?: boolean;
  includePrerelease?: boolean;
  cacheDir?: string | undefined;
}): Promise<string | undefined> {
  const { seam, name, registry, force = false, includePrerelease = false, cacheDir } = options;
  const key = `${registry}|${name}|${includePrerelease ? 'pre' : 'stable'}`;
  const hit = latestCache.get(key);
  if (!force && hit !== undefined && now() - hit.at < versionCacheTtl(hit.value)) return hit.value;

  let read: string | undefined;
  for (const command of viewCommandOf({ name, registry, includePrerelease, cacheDir })) {
    const result = await seam
      .run({
        command,
        intent: productWrite(),
        retry: 'safe',
        timeoutMs: VERSION_CHECK_TIMEOUT_MS,
        bestEffort: true,
      })
      .catch(() => undefined);
    const found = result?.exitCode === 0 ? parseNewestVersion(result.stdout, includePrerelease) : undefined;
    if (found !== undefined) {
      read = found;
      break;
    }
  }
  latestCache.set(key, { at: now(), value: read });
  return read;
}

interface ExistsEntry {
  readonly at: number;
  readonly value: boolean;
}


async function versionExists(
  existsCache: Map<string, ExistsEntry>,
  options: {
  seam: Seam;
  name: string;
  version: string;
  registry: string;
  force?: boolean;
  cacheDir?: string | undefined;
}): Promise<boolean> {
  const { seam, name, version, registry, force = false, cacheDir } = options;
  const key = `${registry}|${name}@${version}`;
  const hit = existsCache.get(key);
  if (!force && hit !== undefined && (hit.value || now() - hit.at < VERSION_CHECK_FAILURE_TTL_MS))
    return hit.value;

  const pnpm = process.env.DSH_WB_PNPM?.trim() ?? '';
  const spec = `${quoteShellArg(`${name}@${version}`)} version --registry ${quoteShellArg(registry)}${cacheFlag(cacheDir)}`;
  let value = false;
  for (const command of [`npm view ${spec}`, `${pnpm === '' ? 'pnpm' : pnpm} view ${spec}`]) {
    const result = await seam
      .run({
        command,
        intent: productWrite(),
        retry: 'safe',
        timeoutMs: VERSION_CHECK_TIMEOUT_MS,
        bestEffort: true,
      })
      .catch(() => undefined);
    if (result?.exitCode === 0 && parseVersion(result.stdout) !== undefined) {
      value = true;
      break;
    }
  }
  existsCache.set(key, { at: now(), value });
  return value;
}

async function missingPartsOf(
  latestCache: Map<string, CacheEntry>,
  existsCache: Map<string, ExistsEntry>,
  options: {
  seam: Seam;
  name: string;
  registry: string;
  version: string;
  force?: boolean;
  cacheDir?: string | undefined;
}): Promise<readonly string[]> {
  const { seam, name, registry, version, force = false, cacheDir } = options;
  const checked = await Promise.all(
    RELEASE_PACKAGES.filter((part) => part !== name).map(async (part) => ({
      part,
      present: await versionExists(existsCache, { seam, name: part, version, registry, force, cacheDir }),
    })),
  );
  return checked.filter((entry) => !entry.present).map((entry) => entry.part);
}

async function probeOf(
  latestCache: Map<string, CacheEntry>,
  options: {
  seam: Seam;
  package: string;
  registry?: string | undefined;
  force?: boolean;
  check?: boolean;
  includePrerelease?: boolean;
  cacheDir?: string | undefined;
  prefix?: string | undefined;
}): Promise<PluginRelease | undefined> {
  const { seam, package: pkg, registry, force = false, check = true, includePrerelease = false, cacheDir, prefix } = options;
  if (pkg === "") return undefined;

  const ledger = await seam
    .run({
      command: `npm ls --prefix ${quoteShellArg(prefix ?? '')} ${quoteShellArg(pkg)} --json --depth=0${cacheFlag(cacheDir)}`,
      intent: productWrite(),
      retry: 'safe',
      timeoutMs: LEDGER_READ_TIMEOUT_MS,
      bestEffort: true,
    })
    .catch(() => undefined);
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
      : await latestVersionOf(latestCache, {
          seam,
          name: pkg,
          registry: source,
          force,
          includePrerelease,
          cacheDir,
        });

  return {
    installed,
    ...(latest === undefined ? {} : { latest }),
  };
}


