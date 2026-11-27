import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'packages');

const PROBE = /^\.[a-z][a-z-]*-[A-Za-z0-9]{6}$/;

const STALE_MS = 10 * 60 * 1000;

export function sweepProbes(log = console.log) {
  let entries;
  try {
    entries = readdirSync(PACKAGES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !PROBE.test(entry.name)) continue;
    const stats = statSync(join(PACKAGES_DIR, entry.name), { throwIfNoEntry: false });
    if (stats === undefined || Date.now() - stats.mtimeMs < STALE_MS) continue;
    rmSync(join(PACKAGES_DIR, entry.name), { recursive: true, force: true });
    found.push(entry.name);
  }
  if (found.length > 0) log(`清掉上次被中断留下的探针目录：${found.join('、')}`);
  return found;
}
