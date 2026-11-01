import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { workbenchRoot } from '@dsh-workbench/shared/host';

const STAGING_ROOT = 'dsh-wb-release';

export function stagingDirOf(unit: string): string {
  return join(tmpdir(), STAGING_ROOT, unit.replace(/[^A-Za-z0-9._-]+/g, '-'));
}

export function journalFileOf(staging: string, unit: string): string {
  return join(staging, 'releases', `${unit}.json`);
}

export function prepareStaging(unit: string, resume: boolean): string {
  const staging = stagingDirOf(unit);
  if (!resume) rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  return staging;
}

export function cleanupStaging(unit: string): void {
  rmSync(stagingDirOf(unit), { recursive: true, force: true });
}

export function adoptTarballFile(file: string, unit: string): string | undefined {
  if (file === '' || !existsSync(file)) return undefined;
  const dest = join(workbenchRoot(), 'artifacts', unit, basename(file));
  if (dest === file) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
  rmSync(file, { force: true });
  return dest;
}

export function mirrorJournal(staging: string, unit: string): void {
  const from = journalFileOf(staging, unit);
  if (!existsSync(from)) return;
  const to = join(workbenchRoot(), 'releases', `${unit}.json`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
