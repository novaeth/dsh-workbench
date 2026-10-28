import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DshHostContext } from '../api/dsh.js';
import {
  ADAPTER_SET_API_VERSION,
  SUPPORTED_ADAPTER_API_VERSIONS,
  type AdapterSet,
  type CoreAdapterSet,
} from './adapters.js';
import { isPackageName } from './spec.js';

export interface WorkbenchConfig {
  readonly adapterSet?: string;
}

export type AdapterSetFailure =
  | 'not-configured'
  | 'no-profile'
  | 'malformed'
  | 'not-resolvable'
  | 'import-failed'
  | 'bad-export'
  | 'factory-failed'
  | 'incompatible-version'
  | 'missing-member';

export type AdapterSetLoad =
  | { readonly ok: true; readonly spec: string; readonly set: CoreAdapterSet }
  | {
      readonly ok: false;
      readonly spec?: string;
      readonly failure: AdapterSetFailure;
      readonly detail: string;
      readonly cause?: unknown;
    };

const CORE_MEMBERS = ['data', 'supply', 'profile', 'probe'] as const;

const CORE_METHODS = [
  ['data', 'read'],
  ['data', 'request'],
  ['data', 'requestMany'],
  ['data', 'submit'],
  ['supply', 'resolvePluginSource'],
  ['supply', 'libInstallCommand'],
  ['supply', 'pluginInstallPlan'],
  ['supply', 'latestVersion'],
  ['supply', 'missingReleaseParts'],
  ['supply', 'probeRelease'],
  ['supply', 'splitNpmSpec'],
  ['profile', 'dirOf'],
  ['profile', 'dshPlugins'],
  ['profile', 'selfUpdateView'],
  ['probe', 'probeUnits'],
  ['probe', 'registerPreflight'],
  ['probe', 'declaredPluginCommands'],
] as const;

const FULL_MEMBERS = ['modules', 'runtime', 'plugins', 'actions'] as const;

const FULL_METHODS = [
  ['modules', 'isolatedRoot'],
  ['modules', 'isolatedHome'],
  ['modules', 'cliCatalogPath'],
  ['modules', 'vendorPluginsDir'],
  ['modules', 'runtimeInstallCommand'],
  ['modules', 'afterLibInstall'],
  ['modules', 'profileDirOf'],
  ['modules', 'profileModules'],
  ['modules', 'readInstalledModule'],
  ['modules', 'readProfilePackage'],
  ['modules', 'readBundleManager'],
  ['modules', 'createRegistryNotebook'],
  ['modules', 'declarationGaps'],
  ['modules', 'moduleDeclarationOf'],
  ['modules', 'registryDeclarationOf'],
  ['modules', 'pathDeclarationOf'],
  ['modules', 'declarationRefusalOf'],
  ['modules', 'refusalReason'],
  ['modules', 'packageRouteOf'],
  ['modules', 'isNewerVersion'],
  ['modules', 'startSelfUpdate'],
  ['runtime', 'packageRoot'],
  ['runtime', 'capabilities'],
  ['runtime', 'commands'],
  ['runtime', 'runners'],
  ['runtime', 'health'],
  ['runtime', 'seed'],
  ['runtime', 'warnUnwritableRoot'],
  ['plugins', 'declarationLookup'],
  ['plugins', 'createUnits'],
  ['actions', 'configSyncHandler'],
  ['actions', 'profileCreateHandler'],
  ['actions', 'configSyncAction'],
  ['actions', 'profileCreateAction'],
] as const;

function methodOf(value: Record<string, unknown>, member: string, method: string): unknown {
  const part = value[member];
  if (typeof part !== 'object' || part === null) return undefined;
  return (part as Record<string, unknown>)[method];
}

function failure(
  failureKind: AdapterSetFailure,
  detail: string,
  spec?: string,
  cause?: unknown,
): AdapterSetLoad {
  return {
    ok: false,
    ...(spec === undefined ? {} : { spec }),
    failure: failureKind,
    detail,
    ...(cause === undefined ? {} : { cause }),
  };
}

function profileDirOf(ctx: DshHostContext): string | null {
  const profile = ctx.get<{ dir?: unknown }>('profileContext');
  const dir = typeof profile?.dir === 'string' ? profile.dir.trim() : '';
  return dir === '' ? null : dir;
}

function packageDirOf(spec: string, from: string): string | undefined {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', spec);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

function entryOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['import', 'node', 'module', 'default', 'require']) {
    const found = entryOf(record[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

function exportsEntryOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return entryOf(value);
  const record = value as Record<string, unknown>;
  return '.' in record ? entryOf(record['.']) : entryOf(record);
}

function esmEntryUrl(spec: string, profileDir: string): string | undefined {
  const dir = packageDirOf(spec, profileDir);
  if (dir === undefined) return undefined;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const main = typeof pkg['main'] === 'string' ? pkg['main'] : undefined;
  const module = typeof pkg['module'] === 'string' ? pkg['module'] : undefined;
  const entry = exportsEntryOf(pkg['exports']) ?? module ?? main ?? 'index.js';
  const file = join(dir, entry);
  return existsSync(file) ? pathToFileURL(file).href : undefined;
}

function resolveFromProfile(spec: string, profileDir: string): string | undefined {
  const esm = esmEntryUrl(spec, profileDir);
  if (esm !== undefined) return esm;
  const parent = pathToFileURL(join(profileDir, 'package.json')).href;
  try {
    return pathToFileURL(createRequire(parent).resolve(spec)).href;
  } catch {
    return undefined;
  }
}

function versionOf(value: Record<string, unknown>): number | undefined {
  const version = value['apiVersion'];
  return typeof version === 'number' && Number.isInteger(version) ? version : undefined;
}

export function validateAdapterSet(value: unknown, spec: string): AdapterSetLoad {
  if (typeof value !== 'object' || value === null) {
    return failure('missing-member', `${spec} 的 createAdapterSet(ctx) 没回一个对象`, spec);
  }
  const record = value as Record<string, unknown>;
  const version = versionOf(record);
  if (version === undefined || !SUPPORTED_ADAPTER_API_VERSIONS.includes(version)) {
    return failure(
      'incompatible-version',
      `${spec} 的适配器协议版本是 ${String(record['apiVersion'])}，工作台只认 v${ADAPTER_SET_API_VERSION}`,
      spec,
    );
  }
  const missing: string[] = CORE_MEMBERS.filter(
    (member) => record[member] === undefined || record[member] === null,
  );
  for (const [member, method] of CORE_METHODS) {
    if (typeof methodOf(record, member, method) !== 'function') missing.push(`${member}.${method}`);
  }
  if (typeof record['id'] !== 'string' || record['id'].trim() === '') missing.push('id');
  if (typeof record['version'] !== 'string' || record['version'].trim() === '') missing.push('version');
  if (FULL_MEMBERS.some((member) => record[member] !== undefined)) {
    for (const member of FULL_MEMBERS) {
      if (typeof record[member] !== 'object' || record[member] === null) missing.push(member);
    }
    for (const [member, method] of FULL_METHODS) {
      if (typeof methodOf(record, member, method) !== 'function') missing.push(`${member}.${method}`);
    }
  }
  if (missing.length > 0) {
    return failure('missing-member', `${spec} 少了 ${missing.join(' / ')}`, spec);
  }
  return { ok: true, spec, set: record as unknown as CoreAdapterSet };
}

export async function loadAdapterSet(
  ctx: DshHostContext,
  spec: string | undefined,
): Promise<AdapterSetLoad> {
  const wanted = typeof spec === 'string' ? spec.trim() : spec === undefined ? '' : String(spec).trim();
  if (wanted === '') return failure('not-configured', '没有配置 adapterSet');
  const profileDir = profileDirOf(ctx);
  if (profileDir === null) return failure('no-profile', '找不到 profile 目录，无法从 profile 解析适配器集合', wanted);
  if (!isPackageName(wanted)) {
    return failure('malformed', `适配器集合要写包名（如 @acme/adapters-set），收到 ${JSON.stringify(wanted)}`, wanted);
  }

  const url = resolveFromProfile(wanted, profileDir);
  if (url === undefined) {
    return failure('not-resolvable', `在 profile 里解析不到 ${wanted}，先把它装进这个 profile`, wanted);
  }

  let mod: Record<string, unknown>;
  try {
    mod = (await import(url)) as Record<string, unknown>;
  } catch (error) {
    return failure('import-failed', `${wanted} 的入口没加载成：${String(error)}`, wanted, error);
  }

  const factory = mod['createAdapterSet'] ?? mod['default'];
  if (typeof factory !== 'function') {
    return failure('bad-export', `${wanted} 没导出 createAdapterSet(ctx)，导出键：${Object.keys(mod).join(', ')}`, wanted);
  }

  let value: Record<string, unknown>;
  try {
    const raw: unknown = await factory(ctx);
    if (typeof raw !== 'object' || raw === null) {
      return failure('missing-member', `${wanted} 的 createAdapterSet(ctx) 没回一个对象`, wanted);
    }
    value = raw as Record<string, unknown>;
  } catch (error) {
    return failure('factory-failed', `${wanted} 的 createAdapterSet(ctx) 抛了：${String(error)}`, wanted, error);
  }

  return validateAdapterSet(value, wanted);
}

export function withDefaultAdapterSet(defaults: AdapterSet, loaded: AdapterSetLoad): AdapterSet {
  if (!loaded.ok) return defaults;
  const set = loaded.set as Partial<AdapterSet>;
  return {
    apiVersion: set.apiVersion ?? defaults.apiVersion,
    id: set.id ?? defaults.id,
    version: set.version ?? defaults.version,
    data: set.data ?? defaults.data,
    libs: set.libs ?? defaults.libs,
    supply: set.supply ?? defaults.supply,
    modules: set.modules ?? defaults.modules,
    profile: set.profile ?? defaults.profile,
    probe: set.probe ?? defaults.probe,
    runtime: set.runtime ?? defaults.runtime,
    plugins: set.plugins ?? defaults.plugins,
    actions: set.actions ?? defaults.actions,
  };
}

function isFullAdapterSet(value: CoreAdapterSet): value is AdapterSet {
  const candidate = value as unknown as Record<string, unknown>;
  return ['modules', 'runtime', 'plugins', 'actions'].every(
    (member) => typeof candidate[member] === 'object' && candidate[member] !== null,
  );
}

export async function resolveAdapterSet(
  ctx: DshHostContext,
  spec: string | undefined,
  makeDefaults: () => Promise<AdapterSet>,
): Promise<{ readonly set: AdapterSet; readonly load: AdapterSetLoad; readonly usedDefaults: boolean }> {
  const load = await loadAdapterSet(ctx, spec);
  if (load.ok && isFullAdapterSet(load.set)) {
    return { set: load.set, load, usedDefaults: false };
  }
  const defaults = await makeDefaults();
  return { set: withDefaultAdapterSet(defaults, load), load, usedDefaults: true };
}

export type { AdapterSet, CoreAdapterSet };
