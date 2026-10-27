import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHANGELOG_FILE,
  appendChangelogEntry,
  changelogDate,
  changelogSectionOf,
  changelogSkeleton,
} from '@dsh-workbench/shared/host';
import type { ChangelogKind } from '@dsh-workbench/shared/host';

export interface ChangelogWrite {
  readonly file: string;
  readonly section: string;
  readonly text: string;
}

export function moduleVersionOf(dir: string): string {
  try {
    const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    return typeof version === 'string' ? version.trim() : '';
  } catch {
    return '';
  }
}

export function writeChangelogEntry(
  dir: string,
  input: { readonly version: string; readonly kind: ChangelogKind; readonly note: string; readonly date?: string },
): ChangelogWrite {
  const file = join(dir, CHANGELOG_FILE);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : changelogSkeleton();
  const text = appendChangelogEntry(current, {
    version: input.version,
    kind: input.kind,
    note: input.note,
    date: input.date ?? changelogDate(),
  });
  writeFileSync(file, text);
  return { file, section: changelogSectionOf(text, input.version) ?? '', text };
}
