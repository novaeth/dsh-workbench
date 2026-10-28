import type { ExtensionNeed, LibNeed, Need, SupplySource } from '../contract/needs.js';
import { npmRegistryOf } from './npm-registry.js';

export interface SupplyDeclaration {
  readonly id: string;
  readonly needs?: readonly Need[];
}

export interface SupplyIndexOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface SupplyEntry {
  readonly key: string;
  readonly kind: 'extension' | 'lib';
  readonly names: readonly string[];
  readonly package: string;
  readonly runtime?: string;
  readonly sources: readonly SupplySource[];
  readonly declarers: readonly string[];
  readonly commands: readonly string[];
  readonly conflicted: boolean;
}

export interface SupplyConflict {
  readonly kind: 'source-mismatch' | 'name-mismatch';
  readonly key: string;
  readonly names: readonly string[];
  readonly declarers: readonly string[];
  readonly detail: string;
}

export interface SupplyIndex {
  readonly entries: ReadonlyMap<string, SupplyEntry>;
  readonly conflicts: readonly SupplyConflict[];
  readonly problems: readonly string[];
  readonly entryOf: (kind: 'extension' | 'lib', name: string) => SupplyEntry | undefined;
  readonly sourcesOf: (kind: 'extension' | 'lib', name: string) => readonly SupplySource[];
}

interface MutableEntry {
  key: string;
  kind: 'extension' | 'lib';
  package: string;
  runtime?: string;
  declared: boolean;
  names: string[];
  sources: SupplySource[];
  declarers: string[];
  commands: string[];
  conflicted: boolean;
}

export function npmSourceOf(
  sources: readonly SupplySource[] | undefined,
): Extract<SupplySource, { kind: 'npm' }> | undefined {
  return sources?.find((source): source is Extract<SupplySource, { kind: 'npm' }> => source.kind === 'npm');
}

function text(value: string | undefined): string {
  return value === undefined ? '' : value.trim();
}

function conventionPackage(name: string): string {
  return `opencli-plugin-${name}`;
}

function nativeSourcePackage(source: SupplySource): string {
  if (source.kind === 'npm') return text(source.package);
  if (source.kind === 'git') return `git:${text(source.url)}`;
  return `local:${text(source.env) || text(source.path)}`;
}

function packageOf(need: ExtensionNeed | LibNeed): string {
  if (need.kind === 'lib') return text(need.name);
  const first = need.sources?.[0];
  if (first === undefined) return conventionPackage(need.name);
  if (first.kind === 'npm') {
    const pkg = text(first.package);
    return pkg === '' ? conventionPackage(need.name) : pkg;
  }
  return nativeSourcePackage(first);
}

function keyOf(kind: 'extension' | 'lib', pkg: string): string {
  return `${kind}:${pkg}`;
}

function registryAddressOf(
  source: Extract<SupplySource, { kind: 'npm' }>,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const resolved = npmRegistryOf(source, env);
  return resolved.ok ? resolved.value : undefined;
}

function sourceCompatible(
  left: SupplySource,
  right: SupplySource,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'npm' && right.kind === 'npm') {
    if (text(left.package) !== '' && text(right.package) !== '' && text(left.package) !== text(right.package)) {
      return false;
    }
    const l = registryAddressOf(left, env);
    const r = registryAddressOf(right, env);
    if (l !== undefined && r !== undefined) return l === r;
    return text(left.registryEnv) === text(right.registryEnv);
  }
  if (left.kind === 'git' && right.kind === 'git') return text(left.url) === text(right.url);
  if (left.kind === 'local' && right.kind === 'local') {
    return text(left.env) === text(right.env) && text(left.path) === text(right.path);
  }
  return false;
}

function sourcesCompatible(
  left: readonly SupplySource[],
  right: readonly SupplySource[],
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (left.length !== right.length) return false;
  return left.every((source, index) => {
    const other = right[index];
    return other !== undefined && sourceCompatible(source, other, env);
  });
}

function mergedSource(left: SupplySource, right: SupplySource): SupplySource {
  if (left.kind === 'npm' && right.kind === 'npm') {
    const pkg = text(left.package) === '' ? right.package : left.package;
    const registryDefault = text(left.registryDefault) === '' ? right.registryDefault : left.registryDefault;
    return {
      ...left,
      ...(pkg === undefined ? {} : { package: pkg }),
      ...(registryDefault === undefined ? {} : { registryDefault }),
    };
  }
  return left;
}

function mergeSources(
  entry: MutableEntry,
  sources: readonly SupplySource[],
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (!entry.declared) {
    entry.declared = true;
    entry.sources = [...sources];
    return true;
  }
  if (!sourcesCompatible(entry.sources, sources, env)) {
    entry.conflicted = true;
    return false;
  }
  entry.sources = entry.sources.map((source, index) => {
    const other = sources[index];
    return other === undefined ? source : mergedSource(source, other);
  });
  return true;
}

function sourceText(source: SupplySource): string {
  if (source.kind === 'npm') {
    return `${source.package === undefined ? '按包名约定' : source.package}（${source.registryEnv ?? '默认源'}）`;
  }
  if (source.kind === 'git') return `git:${source.url}`;
  return `local:${source.env ?? source.path ?? ''}`;
}

function addDeclarer(entry: MutableEntry, unit: string, commands: readonly string[]): void {
  if (!entry.declarers.includes(unit)) entry.declarers.push(unit);
  for (const command of commands) if (!entry.commands.includes(command)) entry.commands.push(command);
}

export function buildSupplyIndex(
  declarations: readonly SupplyDeclaration[],
  options: SupplyIndexOptions = {},
): SupplyIndex {
  const env = options.env ?? {};
  const entries = new Map<string, MutableEntry>();
  const byName = new Map<string, MutableEntry>();
  const conflicts: SupplyConflict[] = [];

  const ensure = (kind: 'extension' | 'lib', pkg: string): MutableEntry => {
    const key = keyOf(kind, pkg);
    const found = entries.get(key);
    if (found !== undefined) return found;
    const created: MutableEntry = {
      key,
      kind,
      package: pkg,
      declared: false,
      names: [],
      sources: [],
      declarers: [],
      commands: [],
      conflicted: false,
    };
    entries.set(key, created);
    return created;
  };

  for (const declaration of declarations) {
    for (const need of declaration.needs ?? []) {
      if (need.kind !== 'extension' && need.kind !== 'lib') continue;
      const pkg = packageOf(need);
      const entry = ensure(need.kind, pkg);
      if (!entry.names.includes(need.name)) entry.names.push(need.name);
      if (need.kind === 'extension') {
        entry.runtime = need.runtime;
        addDeclarer(entry, declaration.id, need.commands ?? []);
      } else {
        addDeclarer(entry, declaration.id, []);
      }
      const same = mergeSources(entry, need.sources ?? [], env);
      if (!same) {
        conflicts.push({
          kind: 'source-mismatch',
          key: entry.key,
          names: [...entry.names],
          declarers: [...entry.declarers],
          detail:
            `${entry.kind === 'extension' ? '插件' : '共用库'} ${entry.names.join('、')} 被 ` +
            `${entry.declarers.join('、')} 声明成了不同的来源（` +
            `${entry.sources.map(sourceText).join(' / ') || '无来源'}）`,
        });
      }
      const nameKey = `${need.kind}:${need.name}`;
      const seen = byName.get(nameKey);
      if (seen !== undefined && seen.key !== entry.key) {
        const detail =
          `${need.kind === 'extension' ? '插件' : '共用库'} ${need.name} 来自不同的包：` +
          `${seen.package} / ${entry.package}`;
        entry.conflicted = true;
        seen.conflicted = true;
        conflicts.push({
          kind: 'name-mismatch',
          key: entry.key,
          names: [need.name],
          declarers: [...new Set([...seen.declarers, ...entry.declarers])],
          detail,
        });
      } else if (seen === undefined) {
        byName.set(nameKey, entry);
      }
    }
  }

  const deduped = new Map<string, SupplyConflict>();
  for (const conflict of conflicts) {
    deduped.set(`${conflict.kind}:${conflict.key}`, conflict);
  }

  const frozenEntries = new Map<string, SupplyEntry>();
  for (const [key, entry] of entries) {
    frozenEntries.set(key, {
      key: entry.key,
      kind: entry.kind,
      names: [...entry.names],
      package: entry.package,
      ...(entry.runtime === undefined ? {} : { runtime: entry.runtime }),
      sources: entry.sources.map((source) => ({ ...source })),
      declarers: [...entry.declarers],
      commands: [...entry.commands],
      conflicted: entry.conflicted,
    });
  }

  const entryOf = (kind: 'extension' | 'lib', name: string): SupplyEntry | undefined =>
    byName.get(`${kind}:${name}`);

  return {
    entries: frozenEntries,
    conflicts: [...deduped.values()],
    problems: [...deduped.values()].map((conflict) => conflict.detail),
    entryOf,
    sourcesOf: (kind, name) => {
      const entry = entryOf(kind, name);
      return entry === undefined || entry.conflicted ? [] : entry.sources;
    },
  };
}
