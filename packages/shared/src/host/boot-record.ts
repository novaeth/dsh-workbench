import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workbenchRoot } from './data-root.js';
import { writeJsonFile } from './fs-write.js';

export interface BootRecord {
  readonly version: string;
  readonly at: string;
  readonly pid?: number | undefined;
}

export function bootFileIn(dir: string): string {
  return join(dir, 'self-update-boot.json');
}

export function upFileIn(dir: string): string {
  return join(dir, 'self-update-up.json');
}

export function workbenchBootFile(): string {
  return bootFileIn(workbenchRoot());
}

export function workbenchUpFile(): string {
  return upFileIn(workbenchRoot());
}

export function readBootRecord(file: string): BootRecord | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Readonly<Record<string, unknown>>;
  if (typeof record.version !== 'string' || typeof record.at !== 'string') return undefined;
  return {
    version: record.version,
    at: record.at,
    ...(typeof record.pid === 'number' ? { pid: record.pid } : {}),
  };
}

export function writeBootRecord(record: BootRecord, file: string): void {
  writeJsonFile(file, record);
}
