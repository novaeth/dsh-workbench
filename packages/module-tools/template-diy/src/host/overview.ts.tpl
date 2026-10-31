import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { OverviewFile, OverviewPayload } from '../model/overview';
import { LIMIT_DEFAULT, LIMIT_MAX } from '../model/prefs';

export const DEFAULT_LIMIT = LIMIT_DEFAULT;
export const MAX_LIMIT = LIMIT_MAX;

export function readOverview(path: string, limit: number): OverviewPayload {
  const entries = readdirSync(path, { withFileTypes: true });
  const files: OverviewFile[] = [];
  let dirs = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      dirs += 1;
      continue;
    }
    if (!entry.isFile()) continue;
    const info = statSync(join(path, entry.name));
    bytes += info.size;
    files.push({ name: entry.name, bytes: info.size, mtime: new Date(info.mtimeMs).toISOString() });
  }
  files.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  return { path, files: files.length, dirs, bytes, largest: files.slice(0, limit) };
}

function searchParam(search: URLSearchParams, name: string): string | undefined {
  const raw = search.get(name);
  return raw === null || raw === '' ? undefined : raw;
}

function limitOf(search: URLSearchParams): number {
  const raw = searchParam(search, 'limit');
  if (raw === undefined) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
}

export function overviewAnswer(search: URLSearchParams): unknown {
  const target = searchParam(search, 'path');
  if (target === undefined) {
    return { ok: false, error: { code: 'no-path', message: '没告诉我要看哪个目录' } };
  }
  try {
    return { ok: true, ...readOverview(target, limitOf(search)) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'overview-unreadable',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
