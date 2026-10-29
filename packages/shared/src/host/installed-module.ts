import fs from 'node:fs';
import path from 'node:path';
import type { DshHostContext } from '../api/dsh.js';
import { declarationProblemsOf, readDeclaration } from '../contract/unit-declaration.js';
import { packageSourceOf } from './installed-sources.js';
import { scopeOf } from './adapter-types.js';
import { isPackageName } from './spec.js';
import type { InstalledModule, ProfileModule, ProfilePackage } from './adapter-types.js';
export interface UnitDeclarationSource {
  readonly pkg: string;
  readonly declaration: unknown;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function profileDirOf(ctx: DshHostContext): string | null {
  const profile = ctx.get<{ dir?: unknown }>('profileContext');
  const dir = typeof profile?.dir === 'string' ? profile.dir.trim() : '';
  return dir === '' ? null : dir;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function profileManifestOf(profileDir: string | null): Readonly<Record<string, unknown>> | undefined {
  if (profileDir === null) return undefined;
  try {
    return asRecord(JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

export function profileModules(profileDir: string | null): readonly ProfileModule[] {
  const record = profileManifestOf(profileDir);
  if (record === undefined) return [];
  const bundles = stringsOf(asRecord(asRecord(record.dsh)?.profile)?.bundles);
  const dependencies = asRecord(record.dependencies) ?? {};
  const names = bundles.length > 0 ? bundles : Object.keys(dependencies);
  const found: ProfileModule[] = [];
  for (const pkg of names) {
    const read = readInstalledModule(profileDir, pkg);
    if (read.kind === 'module') {
      const spec = asText(dependencies[read.pkg]);
      found.push({
        pkg: read.pkg,
        unit: read.unit,
        version: read.version,
        ...(read.registry === undefined ? {} : { registry: read.registry }),
        local: isLocalDependencySpec(spec),
        fromRegistry: isRegistryDependencySpec(spec),
      });
    }
  }
  return found;
}

export function createDeclarationLookup(
  profileDir: string | null,
): (unit: string) => UnitDeclarationSource | undefined {
  let roster: Map<string, string> | undefined;
  const scan = (): Map<string, string> =>
    new Map(profileModules(profileDir).map((row) => [row.unit, row.pkg]));
  return (unit) => {
    roster ??= scan();
    let pkg = roster.get(unit);
    if (pkg === undefined) {
      roster = scan();
      pkg = roster.get(unit);
    }
    return pkg === undefined ? undefined : { pkg, declaration: moduleDeclarationOf(profileDir, pkg) };
  };
}

function registryFromLockfile(profileDir: string, pkg: string): string | undefined {
  let text: string;
  try {
    text = fs.readFileSync(path.join(profileDir, 'pnpm-lock.yaml'), 'utf8');
  } catch {
    return undefined;
  }
  const at = text.indexOf(`  ${pkg}@`);
  const quoted = at === -1 ? text.indexOf(`  '${pkg}@`) : at;
  if (quoted === -1) return undefined;
  const headerEnd = text.indexOf('\n', quoted);
  const end = headerEnd === -1 ? -1 : text.indexOf('\n  ', headerEnd + 1);
  const block = text.slice(quoted, end === -1 ? quoted + 900 : end);
  const match = /tarball:\s*([^\s,}]+)/.exec(block);
  const tarball = match?.[1];
  if (tarball === undefined || !tarball.startsWith('http')) return undefined;
  const cut = tarball.lastIndexOf(`/${pkg}/`);
  if (cut <= 'https://'.length) return undefined;
  return tarball.slice(0, cut);
}

function unquoted(value: string): string {
  const quote = value.charAt(0);
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function registryFromNpmrc(profileDir: string, pkg: string): string | undefined {
  let text: string;
  try {
    text = fs.readFileSync(path.join(profileDir, '.npmrc'), 'utf8');
  } catch {
    return undefined;
  }
  const scope = scopeOf(pkg);
  let fallback: string | undefined;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = unquoted(trimmed.slice(separator + 1).trim());
    if (value === '') continue;
    if (scope !== null && key === `${scope}:registry`) return value;
    if (key === 'registry') fallback = value;
  }
  return fallback;
}

function registryOf(
  profileDir: string,
  pkg: string,
  manifest: Readonly<Record<string, unknown>>,
): string | undefined {
  const declared = asText(asRecord(manifest.publishConfig)?.registry);
  if (declared !== '') return declared;
  const recorded = packageSourceOf(profileDir, pkg);
  if (recorded !== undefined) return recorded.registry;
  const locked = registryFromLockfile(profileDir, pkg);
  return locked === undefined ? registryFromNpmrc(profileDir, pkg) : locked;
}

export function moduleDeclarationOf(profileDir: string | null, pkg: string): unknown {
  if (profileDir === null || !isPackageName(pkg)) return undefined;
  try {
    const text = fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8');
    return asRecord(asRecord(asRecord(JSON.parse(text))?.dsh)?.workbench);
  } catch {
    return undefined;
  }
}

export interface DeclarationGap {
  readonly pkg: string;
  readonly problems: readonly string[];
}

export function declarationGaps(profileDir: string | null): readonly DeclarationGap[] | undefined {
  if (profileManifestOf(profileDir) === undefined) return undefined;
  const gaps: DeclarationGap[] = [];
  for (const module of profileModules(profileDir)) {
    const problems = declarationProblemsOf(module.pkg, moduleDeclarationOf(profileDir, module.pkg));
    if (problems.length > 0) gaps.push({ pkg: module.pkg, problems });
  }
  return gaps;
}

export function declaredPluginCommands(profileDir: string | null): ReadonlyMap<string, ReadonlySet<string>> {
  const declared = new Map<string, Set<string>>();
  for (const module of profileModules(profileDir)) {
    const read = readDeclaration(module.pkg, moduleDeclarationOf(profileDir, module.pkg));
    for (const need of read.manifest?.needs ?? []) {
      if (need.kind !== 'extension') continue;
      const name = need.name.trim();
      if (name === '') continue;
      const commands = declared.get(name) ?? new Set<string>();
      for (const command of need.commands ?? []) commands.add(command);
      declared.set(name, commands);
    }
  }
  return declared;
}

export function readInstalledModule(profileDir: string | null, pkg: string): InstalledModule {
  if (profileDir === null || !isPackageName(pkg)) return { kind: 'unknown', pkg };
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8'));
  } catch {
    return { kind: 'unknown', pkg };
  }
  const record = asRecord(manifest);
  if (record === undefined) return { kind: 'unknown', pkg };
  const declared = asRecord(asRecord(record.dsh)?.workbench);
  const unit = declared === undefined ? '' : asText(declared.unit);
  if (unit === '') return { kind: 'not-module', pkg };
  const registry = registryOf(profileDir, pkg, record);
  return {
    kind: 'module',
    pkg,
    unit,
    version: asText(record.version),
    ...(registry === undefined ? {} : { registry }),
  };
}

const PACKED_ARTIFACT = /\.(?:tgz|tar\.gz|tar)$/i;

export function isPackedArtifactSpec(spec: string): boolean {
  const trimmed = spec.trim();
  const pkgPath = trimmed.startsWith('file:') ? trimmed.slice('file:'.length) : trimmed;
  return PACKED_ARTIFACT.test(pkgPath);
}

export function isLocalDependencySpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (isPackedArtifactSpec(trimmed)) return false;
  return (
    trimmed.startsWith('link:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/')
  );
}

const NON_REGISTRY_SPEC = /^(?:git\+|git:|github:|gitlab:|bitbucket:|https?:|ssh:|workspace:)/i;

export function isRegistryDependencySpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (trimmed === '') return true;
  if (isLocalDependencySpec(trimmed) || isPackedArtifactSpec(trimmed)) return false;
  return !NON_REGISTRY_SPEC.test(trimmed);
}

export function readProfilePackage(profileDir: string | null, pkg: string): ProfilePackage | undefined {
  if (profileDir === null || !isPackageName(pkg)) return undefined;
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const record = asRecord(manifest);
  if (record === undefined) return undefined;
  const version = asText(record.version);
  if (version === '') return undefined;
  const registry = registryOf(profileDir, pkg, record);
  const dependencies = asRecord(profileManifestOf(profileDir)?.dependencies) ?? {};
  const local = isLocalDependencySpec(asText(dependencies[pkg]));
  return {
    pkg,
    version,
    ...(registry === undefined ? {} : { registry }),
    ...(local ? { local: true } : {}),
  };
}

export function packageVersionAt(packageRoot: string): string | undefined {
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const version = asText(asRecord(manifest)?.version);
  return version === '' ? undefined : version;
}
