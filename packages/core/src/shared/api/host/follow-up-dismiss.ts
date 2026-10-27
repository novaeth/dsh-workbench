import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import writeFileAtomic from 'write-file-atomic';

const DISMISS_FILE = 'follow-ups.json';

interface DismissedEntry {
  readonly at?: string;
}

function fileOf(runtimeRoot: string): string {
  return join(runtimeRoot, DISMISS_FILE);
}

function readDismissed(runtimeRoot: string): Readonly<Record<string, DismissedEntry>> {
  try {
    const value: unknown = JSON.parse(readFileSync(fileOf(runtimeRoot), 'utf8'));
    if (typeof value !== 'object' || value === null) return {};
    const dismissed = (value as Readonly<Record<string, unknown>>)['dismissed'];
    if (typeof dismissed !== 'object' || dismissed === null) return {};
    return dismissed as Readonly<Record<string, DismissedEntry>>;
  } catch {
    return {};
  }
}

export function isFollowUpDismissed(runtimeRoot: string, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(readDismissed(runtimeRoot), id);
}

export function dismissFollowUp(runtimeRoot: string, id: string): void {
  const file = fileOf(runtimeRoot);
  mkdirSync(dirname(file), { recursive: true });
  const dismissed = { ...readDismissed(runtimeRoot), [id]: { at: new Date().toISOString() } };
  writeFileAtomic.sync(file, `${JSON.stringify({ dismissed }, null, 2)}\n`);
}
