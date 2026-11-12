import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { authorOf } from './package-author';
import type {
  DiscoverDoc,
  DiscoverDocKind,
  InstalledPackageInfo,
} from '@dsh-workbench/shared/contract/protocol/market-index';

export interface InstalledPackageReaderOptions {
  readonly profileDir: string | null;
  readonly sharedLibsDir: string | null;
  readonly workbenchRoot: string;
  readonly pluginDirOf?: ((pkg: string) => string | undefined) | undefined;
}

export interface InstalledPackageReader {
  info(pkg: string): InstalledPackageInfo | null;
  doc(pkg: string, version: string, kind: DiscoverDocKind): DiscoverDoc;
}

const FILES: Readonly<Record<DiscoverDocKind, string>> = {
  readme: 'README.md',
  changelog: 'CHANGELOG.md',
};

const MAX_BYTES = 200 * 1024;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

interface Found {
  readonly dir: string;
  readonly manifest: Record<string, unknown>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clipped(text: string): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= MAX_BYTES) return text;
  return buffer.subarray(0, MAX_BYTES).toString('utf8');
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function keywordsOf(manifest: Record<string, unknown>): readonly string[] {
  const value = manifest['keywords'];
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((item) => {
        const text = textOf(item);
        return text === '' ? [] : [text];
      }),
    ),
  ];
}

function manifestOf(dir: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function within(root: string, dir: string): boolean {
  try {
    const realRoot = realpathSync(root);
    const realDir = realpathSync(dir);
    return realDir === realRoot || realDir.startsWith(`${realRoot}${sep}`);
  } catch {
    return false;
  }
}

function safeName(pkg: string): boolean {
  const text = pkg.trim();
  if (text === '' || !PACKAGE_NAME.test(text)) return false;
  return !text.split('/').some((part) => part === '' || part === '.' || part === '..');
}

export function createInstalledPackageReader(
  options: InstalledPackageReaderOptions,
): InstalledPackageReader {
  const docCache = new Map<string, DiscoverDoc>();

  function dirsOf(pkg: string): readonly string[] {
    const dirs: string[] = [];
    const plugin = options.pluginDirOf?.(pkg);
    if (plugin !== undefined && existsSync(join(plugin, 'package.json'))) dirs.push(plugin);
    if (!safeName(pkg)) return dirs;
    if (options.profileDir !== null) {
      const dir = join(options.profileDir, 'node_modules', pkg);
      if (within(options.profileDir, dir) || within(options.workbenchRoot, dir)) dirs.push(dir);
    }
    if (options.sharedLibsDir !== null) {
      const dir = join(options.sharedLibsDir, pkg);
      if (within(options.sharedLibsDir, dir)) dirs.push(dir);
    }
    return [...new Set(dirs)];
  }

  function find(pkg: string, version: string | undefined, strict: boolean): Found | null {
    for (const dir of dirsOf(pkg)) {
      const manifest = manifestOf(dir);
      if (manifest === null) continue;
      if (strict && version !== undefined && version !== '' && textOf(manifest['version']) !== version) {
        continue;
      }
      return { dir, manifest };
    }
    return null;
  }

  function info(pkg: string): InstalledPackageInfo | null {
    const key = pkg.trim();
    if (key === '') return null;
    const found = find(key, undefined, false);
    if (found === null) return null;
    const version = textOf(found.manifest['version']);
    const description = textOf(found.manifest['description']);
    const author = authorOf(found.manifest);
    const homepage = textOf(found.manifest['homepage']);
    const next: InstalledPackageInfo = {
      pkg: key,
      ...(version === '' ? {} : { version }),
      ...(description === '' ? {} : { description }),
      ...(author === '' ? {} : { author }),
      ...(homepage === '' ? {} : { homepage }),
      keywords: keywordsOf(found.manifest),
    };
    return next;
  }

  function doc(pkg: string, version: string, kind: DiscoverDocKind): DiscoverDoc {
    const key = `${pkg.trim()}\u0000${version}\u0000${kind}`;
    const cached = docCache.get(key);
    if (cached !== undefined) return cached;
    const found = find(pkg.trim(), version, true);
    if (found === null) {
      const missing: DiscoverDoc = { ok: false, kind, version, reason: 'missing' };
      docCache.set(key, missing);
      return missing;
    }
    try {
      const text = readFileSync(join(found.dir, FILES[kind]), 'utf8');
      if (text.trim() === '') {
        const missing: DiscoverDoc = { ok: false, kind, version, reason: 'missing' };
        docCache.set(key, missing);
        return missing;
      }
      const next: DiscoverDoc = { ok: true, kind, version, text: clipped(text) };
      docCache.set(key, next);
      return next;
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
      if (code === 'ENOENT') {
        const missing: DiscoverDoc = { ok: false, kind, version, reason: 'missing' };
        docCache.set(key, missing);
        return missing;
      }
      const next: DiscoverDoc = {
        ok: false,
        kind,
        version,
        reason: 'unavailable',
        detail: messageOf(error),
      };
      docCache.set(key, next);
      return next;
    }
  }

  return { info, doc };
}
