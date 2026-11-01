import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nowIso, writeJsonFile } from '@dsh-workbench/shared/host';


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
  const dismissed = { ...readDismissed(runtimeRoot), [id]: { at: nowIso() } };
  writeJsonFile(fileOf(runtimeRoot), { dismissed });
}
