import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface DiyModule {
  readonly unit: string;
  readonly name: string;
  readonly description: string;
  readonly dir: string;
  readonly installed: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function insideRoot(root: string, target: string): boolean {
  const base = existsSync(root) ? realpathSync(root) : resolve(root);
  const real = existsSync(target) ? realpathSync(target) : resolve(target);
  const rel = relative(base, real);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function manifestAt(dir: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

function pnpmGlobs(root: string): readonly string[] {
  const file = join(root, 'pnpm-workspace.yaml');
  if (!existsSync(file)) return [];
  const globs: string[] = [];
  let inside = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const bare = line.replace(/#.*$/u, '').trimEnd();
    if (/^packages\s*:/u.test(bare)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (bare.trim() === '') continue;
    if (/^\s+-/u.test(bare)) {
      const raw = bare
        .replace(/^\s*-\s*/u, '')
        .trim()
        .replace(/^['"]|['"]$/gu, '');
      if (raw !== '') globs.push(raw);
      continue;
    }
    if (!/^\s/u.test(bare)) break;
  }
  return globs;
}

function npmGlobs(root: string): readonly string[] {
  const workspaces = manifestAt(root)?.['workspaces'];
  if (Array.isArray(workspaces)) return workspaces.filter((one): one is string => typeof one === 'string');
  const nested = asRecord(workspaces)?.['packages'];
  return Array.isArray(nested) ? nested.filter((one): one is string => typeof one === 'string') : [];
}

function declaredGlobs(root: string): readonly string[] {
  return [...pnpmGlobs(root), ...npmGlobs(root)];
}

export type WorkspaceShape = 'workspace' | 'package' | 'bare';

export function shapeOf(root: string): WorkspaceShape {
  if (pnpmGlobs(root).length > 0 || npmGlobs(root).length > 0) return 'workspace';
  return manifestAt(root) === undefined ? 'bare' : 'package';
}

function dirsOfPattern(root: string, pattern: string): readonly string[] {
  const clean = pattern.replace(/^\.\//u, '').replace(/\/+$/u, '');
  if (clean === '' || clean.includes('**')) return [];
  if (clean.endsWith('/*')) {
    const base = join(root, clean.slice(0, -2));
    if (!existsSync(base)) return [];
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => join(base, entry.name));
  }
  if (clean.includes('*')) return [];
  return [join(root, clean)];
}

export function modulesIn(root: string, installed: readonly string[] = []): readonly DiyModule[] {
  const already = new Set(installed);
  const dirs = new Set<string>([
    root,
    ...declaredGlobs(root).flatMap((pattern) => dirsOfPattern(root, pattern)),
  ]);
  const rows: DiyModule[] = [];
  for (const dir of dirs) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const record = asRecord(manifest);
    if (record === undefined) continue;
    const declared = asRecord(asRecord(record['dsh'])?.['workbench']);
    const unit = declared === undefined ? '' : asText(declared['unit']);
    if (unit === '') continue;
    rows.push({
      unit,
      name: asText(record['name']),
      description: asText(record['description']),
      dir,
      installed: already.has(unit),
    });
  }
  return rows.sort((left, right) => left.unit.localeCompare(right.unit));
}

export function readDesignOfModule(dir: string): unknown {
  const file = join(dir, 'design.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export interface SyncState {
  readonly state: 'ok' | 'syncing' | 'failed';
  readonly version: string;
  readonly at: string;
  readonly reason?: string;
}

export function syncStateOf(workspaceRoot: string): SyncState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(workspaceRoot, '.sync.json'), 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  const state = asText(record['state']);
  if (state !== 'ok' && state !== 'syncing' && state !== 'failed') return undefined;
  const reason = asText(record['reason']);
  return {
    state,
    version: asText(record['version']),
    at: asText(record['at']),
    ...(reason === '' ? {} : { reason }),
  };
}

export interface Toolchain {
  readonly core: string;
  readonly moduleTools: string;
  readonly shared: string;
}

export function toolchainOf(workspaceRoot: string): Toolchain | undefined {
  const versionOf = (name: string): string => {
    try {
      const parsed = JSON.parse(
        readFileSync(join(workspaceRoot, 'node_modules', '@dsh-workbench', name, 'package.json'), 'utf8'),
      ) as { readonly version?: unknown };
      return asText(parsed.version);
    } catch {
      return '';
    }
  };
  const core = versionOf('core');
  const moduleTools = versionOf('module-tools');
  const shared = versionOf('shared');
  if (core === '' || moduleTools === '' || shared === '') return undefined;
  return { core, moduleTools, shared };
}
