import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const DSH_THEME_PACKAGE = '@deepseek-ai/dsh-client-ui-theme';
export const SHELL_PACKAGE = '@dsh-workbench/core';
export const DSW_PREFIX = '--dsw-';
export const WB_PREFIX = '--wb-';

export interface TokenValues {
  readonly light: string | null;
  readonly dark: string | null;
}

export interface TokenEntry {
  readonly name: string;
  readonly values: TokenValues;
}

export interface TokenSource {
  readonly package: string;
  readonly version: string | null;
  readonly file: string;
  readonly entries: readonly TokenEntry[];
}

export interface TokenSet {
  readonly dsw: TokenSource | null;
  readonly wb: TokenSource | null;
}

const BLOCK = /([^{}]*)\{([^{}]*)\}/g;
const DECLARATION = /(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g;
const DARK_BLOCK = /data-ds-dark-theme/;
const VAR_USE = /var\(\s*(--[a-z0-9-]+)\s*(?:,[^()]*)?\)/g;

function rawDefinitionsIn(text: string, prefix: string): Map<string, { light?: string; dark?: string }> {
  const defs = new Map<string, { light?: string; dark?: string }>();
  for (const block of text.matchAll(BLOCK)) {
    const selector = block[1] ?? '';
    const dark = DARK_BLOCK.test(selector);
    for (const declaration of (block[2] ?? '').matchAll(DECLARATION)) {
      const name = declaration[1] ?? '';
      const value = (declaration[2] ?? '').trim();
      if (!name.startsWith(prefix) || value === '') continue;
      const found = defs.get(name) ?? {};
      const key = dark ? 'dark' : 'light';
      if (found[key] === undefined) found[key] = value;
      defs.set(name, found);
    }
  }
  return defs;
}

function resolved(value: string, scheme: 'light' | 'dark', defs: Map<string, { light?: string; dark?: string }>, depth = 0): string {
  if (depth >= 4 || !value.includes('var(')) return value;
  return value.replace(VAR_USE, (whole, name: string) => {
    const found = defs.get(name);
    if (found === undefined) return whole;
    const next = scheme === 'dark' ? found.dark ?? found.light : found.light ?? found.dark;
    return next === undefined ? whole : resolved(next, scheme, defs, depth + 1);
  });
}

export function tokenEntriesIn(text: string, prefix: string): readonly TokenEntry[] {
  const defs = rawDefinitionsIn(text, prefix);
  return [...defs.entries()]
    .map(([name, found]) => ({
      name,
      values: {
        light: found.light === undefined ? null : resolved(found.light, 'light', defs),
        dark: found.dark === undefined ? null : resolved(found.dark, 'dark', defs),
      },
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

interface PackageManifest {
  readonly name: string | null;
  readonly version: string | null;
  readonly root: string;
}

function manifestAt(root: string): PackageManifest | null {
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (typeof manifest !== 'object' || manifest === null) return null;
    const record = manifest as { name?: unknown; version?: unknown };
    return {
      name: typeof record.name === 'string' ? record.name : null,
      version: typeof record.version === 'string' ? record.version : null,
      root,
    };
  } catch {
    return null;
  }
}

function findPackage(startDirs: readonly string[], packageName: string): PackageManifest | null {
  for (const start of startDirs) {
    if (start.trim() === '') continue;
    const own = manifestAt(start);
    if (own !== null && own.name === packageName) return own;
    let at = resolve(start);
    for (;;) {
      const candidate = join(at, 'node_modules', ...packageName.split('/'));
      const manifest = manifestAt(candidate);
      if (manifest !== null && (manifest.name === null || manifest.name === packageName)) return manifest;
      const parent = dirname(at);
      if (parent === at) break;
      at = parent;
    }
  }
  return null;
}

function sourceAt(
  startDirs: readonly string[],
  packageName: string,
  tail: string,
  prefix: string,
): TokenSource | null {
  const manifest = findPackage(startDirs, packageName);
  if (manifest === null) return null;
  const file = join(manifest.root, tail);
  if (!existsSync(file)) return null;
  return {
    package: packageName,
    version: manifest.version,
    file,
    entries: tokenEntriesIn(readFileSync(file, 'utf8'), prefix),
  };
}

export function readTokens(startDirs: readonly string[]): TokenSet {
  const dsw = sourceAt(startDirs, DSH_THEME_PACKAGE, join('lib', 'client.js'), DSW_PREFIX);
  const wb = sourceAt(startDirs, SHELL_PACKAGE, 'client.js', WB_PREFIX);
  return { dsw, wb };
}

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const same = left[row - 1] === right[column - 1] ? 0 : 1;
      current.push(
        Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, (previous[column - 1] ?? 0) + same),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

function commonPrefixLength(left: string, right: string): number {
  const cap = Math.min(left.length, right.length);
  let at = 0;
  while (at < cap && left[at] === right[at]) at += 1;
  return at;
}

export function nearestTokens(name: string, names: readonly string[], limit = 6): readonly string[] {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return [];
  const shared = wanted.slice(0, wanted.lastIndexOf('-') + 1);
  return names
    .flatMap((one) => {
      const lower = one.toLowerCase();
      const typos = lower.length < 3 ? Number.POSITIVE_INFINITY : distance(lower, wanted);
      if (typos <= 2) return [{ one, typos }];
      const prefix = commonPrefixLength(lower, wanted);
      if (prefix < 8) return [];
      const sameStem = shared.length >= 8 && lower.startsWith(shared);
      const score = 10 + typos - prefix + (sameStem ? 0 : 20);
      return score < 20 ? [{ one, typos: score }] : [];
    })
    .sort((left, right) => left.typos - right.typos || left.one.length - right.one.length || left.one.localeCompare(right.one))
    .slice(0, limit)
    .map((one) => one.one);
}

export function tokenFamilyOf(name: string): string {
  const rest = name.startsWith(DSW_PREFIX) ? name.slice(DSW_PREFIX.length) : name.startsWith(WB_PREFIX) ? name.slice(WB_PREFIX.length) : name;
  const cut = rest.indexOf('-');
  return cut === -1 ? rest : rest.slice(0, cut);
}
