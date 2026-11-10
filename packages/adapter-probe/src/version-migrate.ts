import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { SELF_UPDATE_PACKAGES } from './self-update-plan.js';

export interface MigrationReport {
  readonly needed: boolean;
  readonly entries: readonly string[];
}

function isRealDir(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isSymbolicLink() ? false : info.isDirectory();
  } catch {
    return false;
  }
}

export function migrationReportOf(input: {
  readonly profileDir: string;
  readonly packages?: readonly string[] | undefined;
}): MigrationReport {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  const entries = packages.filter((pkg) => isRealDir(join(input.profileDir, 'node_modules', pkg)));
  return { needed: entries.length > 0, entries };
}
