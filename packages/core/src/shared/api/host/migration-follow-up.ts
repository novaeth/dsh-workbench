import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isFollowUpDismissed } from './follow-up-dismiss.js';

export interface MigrationFollowUpInput {
  readonly home: string;
  readonly profile: string;
  readonly runtimeRoot?: string | undefined;
}

export const MIGRATION_FOLLOW_UP_ID = 'data-root-migration';

export interface WorkbenchMigrationFollowUp {
  readonly id: typeof MIGRATION_FOLLOW_UP_ID;
  readonly kind: 'data-migration';
  readonly hard: false;
}

function hasEntries(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => name !== '.DS_Store');
  } catch {
    return false;
  }
}

function legacyDataIn(root: string): boolean {
  return (
    existsSync(join(root, 'storages', 'workspace.json')) ||
    hasEntries(join(root, 'sessions')) ||
    hasEntries(join(root, 'attachments'))
  );
}

function pathsIn(file: string): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof value !== 'object' || value === null) return new Set();
    const record = value as Readonly<Record<string, unknown>>;
    const tables = record['tables'];
    if (typeof tables !== 'object' || tables === null) return new Set();
    const workspaces = (tables as Readonly<Record<string, unknown>>)['workspaces'];
    if (typeof workspaces !== 'object' || workspaces === null) return new Set();
    const paths = new Set<string>();
    for (const entry of Object.values(workspaces as Readonly<Record<string, unknown>>)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const path = (entry as Readonly<Record<string, unknown>>)['path'];
      if (typeof path === 'string') paths.add(path);
    }
    return paths;
  } catch {
    return new Set();
  }
}

function hasMissingPaths(sourceFile: string, targetFile: string): boolean {
  const source = pathsIn(sourceFile);
  if (source.size === 0) return false;
  const target = pathsIn(targetFile);
  for (const path of source) {
    if (!target.has(path)) return true;
  }
  return false;
}

export function migrationFollowUp(input: MigrationFollowUpInput): WorkbenchMigrationFollowUp | undefined {
  const runtimeRoot = input.runtimeRoot ?? join(input.home, input.profile);
  if (resolve(runtimeRoot) === resolve(input.home)) return undefined;
  if (isFollowUpDismissed(runtimeRoot, MIGRATION_FOLLOW_UP_ID)) return undefined;
  if (!legacyDataIn(runtimeRoot)) return undefined;
  const marker = join(runtimeRoot, '.data-root-shared');
  if (!existsSync(marker)) {
    return { id: MIGRATION_FOLLOW_UP_ID, kind: 'data-migration', hard: false };
  }
  const source = join(runtimeRoot, 'storages', 'workspace.json');
  const target = join(input.home, 'storages', 'workspace.json');
  if (!existsSync(source) || !existsSync(target)) return undefined;
  return hasMissingPaths(source, target)
    ? { id: MIGRATION_FOLLOW_UP_ID, kind: 'data-migration', hard: false }
    : undefined;
}
