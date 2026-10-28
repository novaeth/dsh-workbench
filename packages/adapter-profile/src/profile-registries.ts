import fs from 'node:fs';
import path from 'node:path';
export interface BundleChange {
  readonly pkg?: string;
  readonly registry?: string;
  readonly application?: string;
  readonly packageResult?: { readonly kind?: string; readonly output?: string };
  readonly errorDetail?: string;
}

export interface RegistryEntry {
  readonly scope: string;
  readonly registry: string;
}

export interface RegistryNotebook {
  sources(): readonly RegistryEntry[];
  remember(entries: readonly RegistryEntry[]): readonly string[];
  swapScope?(scope: string, registry: string): () => void;
}

export const REGISTRY_MARKER =
  '# dsh-workbench 写的：这一行的包只在这个源上（dsh 卸载没有源参数，pnpm 得问得到）';

export function scopeOf(pkg: string): string | null {
  const slash = pkg.indexOf('/');
  return pkg.startsWith('@') && slash > 1 ? pkg.slice(0, slash) : null;
}

export function normalizeRegistry(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function sameRegistry(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (a.trim() === '' || b.trim() === '') return false;
  return normalizeRegistry(a) === normalizeRegistry(b);
}

function registryRootOf(name: string, tarball: string): string | null {
  const at = tarball.indexOf(`/${name}/-/`);
  if (at > 0) return normalizeRegistry(tarball.slice(0, at));
  try {
    return normalizeRegistry(new URL(tarball).origin);
  } catch {
    return null;
  }
}

const PACKAGE_KEY = /^ {2}'?(\S+)'?:\s*$/;
const PACKAGE_NAME = /^(?:@[^/\s]+\/)?[^/\s@]+$/;
const TARBALL = /tarball:\s*(\S+?)\}?\s*$/;

export function sourcesFromLockfile(text: string): readonly RegistryEntry[] {
  const found = new Map<string, string | null>();
  let name: string | null = null;
  for (const line of text.split('\n')) {
    const key = PACKAGE_KEY.exec(line);
    if (key !== null) {
      const raw = key[1] ?? '';
      const at = raw.lastIndexOf('@');
      const candidate = at > 0 ? raw.slice(0, at) : '';
      name = PACKAGE_NAME.test(candidate) ? candidate : null;
      continue;
    }
    if (name === null) continue;
    const tarball = TARBALL.exec(line);
    if (tarball === null) continue;
    const scope = scopeOf(name);
    const root = registryRootOf(name, tarball[1] ?? '');
    name = null;
    if (scope === null || root === null) continue;
    const seen = found.get(scope);
    if (seen === undefined) found.set(scope, root);
    else if (!sameRegistry(seen, root)) found.set(scope, null);
  }
  return [...found.entries()]
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([scope, registry]) => ({ scope, registry }));
}

export interface RegistryConfigMerge {
  readonly text: string;
  readonly added: readonly string[];
}

export function mergeRegistryConfig(text: string, entries: readonly RegistryEntry[]): RegistryConfigMerge {
  const lines = text.split('\n');
  const present = (key: string): boolean => lines.some((line) => line.trim().startsWith(`${key}=`));
  const appended: string[] = [];
  const added: string[] = [];
  for (const entry of entries) {
    const key = `${entry.scope}:registry`;
    if (entry.registry.trim() === '' || present(key)) continue;
    lines.push(`${key}=${normalizeRegistry(entry.registry)}`);
    appended.push(`${key}=${normalizeRegistry(entry.registry)}`);
    added.push(key);
  }
  if (appended.length === 0) return { text, added: [] };
  const base = text === '' ? '' : text.endsWith('\n') ? text : `${text}\n`;
  const marker = base.includes(REGISTRY_MARKER) ? '' : `${REGISTRY_MARKER}\n`;
  return { text: `${base}${marker}${appended.join('\n')}\n`, added };
}

export function replaceScopeRegistry(text: string, scope: string, registry: string): string {
  const key = `${scope}:registry`;
  const value = normalizeRegistry(registry);
  let found = false;
  const lines = text.split('\n').map((line) => {
    if (!line.trim().startsWith(`${key}=`)) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (found) return lines.join('\n');
  const base = text === '' ? '' : text.endsWith('\n') ? text : `${text}\n`;
  return `${base}${key}=${value}\n`;
}

function readNpmrc(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function writeNpmrc(file: string, text: string): void {
  const temp = `${file}.dsh-workbench.tmp`;
  fs.writeFileSync(temp, text, { mode: 0o600 });
  fs.renameSync(temp, file);
}

export function registryFailure(change: BundleChange): boolean {
  if (change.application !== 'failed') return false;
  if (change.packageResult?.kind === 'not-found') return true;
  const output = change.packageResult?.output ?? change.errorDetail ?? '';
  return /ERR_PNPM_[A-Z_]*FETCH/.test(output);
}

export function createRegistryNotebook(dir: string | null): RegistryNotebook {
  return {
    sources() {
      if (dir === null) return [];
      try {
        return sourcesFromLockfile(fs.readFileSync(path.join(dir, 'pnpm-lock.yaml'), 'utf8'));
      } catch {
        return [];
      }
    },
    remember(entries) {
      if (dir === null || entries.length === 0) return [];
      const file = path.join(dir, '.npmrc');
      const merged = mergeRegistryConfig(readNpmrc(file), entries);
      if (merged.added.length === 0) return [];
      writeNpmrc(file, merged.text);
      return merged.added;
    },
    swapScope(scope, registry) {
      if (dir === null || scope.trim() === '' || registry.trim() === '') return () => {};
      const file = path.join(dir, '.npmrc');
      const key = `${scope.trim()}:registry`;
      const value = normalizeRegistry(registry);
      const before = readNpmrc(file);
      const previous = before.split('\n').find((line) => line.trim().startsWith(`${key}=`));
      const after = replaceScopeRegistry(before, scope.trim(), registry);
      if (after === before) return () => {};
      writeNpmrc(file, after);
      return () => {
        const now = readNpmrc(file);
        if (now === after) {
          if (before === '') fs.rmSync(file, { force: true });
          else writeNpmrc(file, before);
          return;
        }
        if (!now.includes(`${key}=${value}`)) return;
        const restored =
          previous === undefined
            ? now.split('\n').filter((line) => !line.trim().startsWith(`${key}=`)).join('\n')
            : now.replace(`${key}=${value}`, previous);
        writeNpmrc(file, restored);
      };
    },
  };
}
