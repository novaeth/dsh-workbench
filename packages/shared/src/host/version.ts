import { readFileSync } from 'node:fs';
import semver from 'semver';

export function compareVersions(left: string, right: string): number | undefined {
  const a = semver.valid(left.trim());
  const b = semver.valid(right.trim());
  if (a === null || b === null) return undefined;
  return semver.compare(a, b);
}

export function isValidVersion(value: string): boolean {
  return semver.valid(value.trim()) !== null;
}

export function isNewerVersion(latest: string, installed: string): boolean {
  if (latest === installed) return false;
  const compared = compareVersions(latest, installed);
  return compared === undefined ? true : compared > 0;
}

export function runningVersionOf(moduleUrl: string): string | undefined {
  for (const depth of ['../../package.json', '../package.json']) {
    try {
      const read = JSON.parse(readFileSync(new URL(depth, moduleUrl), 'utf8')) as {
        readonly version?: unknown;
        readonly name?: unknown;
      };
      if (typeof read.name !== 'string' || !read.name.startsWith('@dsh-workbench/')) continue;
      return typeof read.version === 'string' && read.version !== '' ? read.version : undefined;
    } catch {
      continue;
    }
  }
  return undefined;
}
