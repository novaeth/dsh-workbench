import { readFileSync } from 'node:fs';

export function runningVersionOf(moduleUrl: string): string | undefined {
  try {
    const read = JSON.parse(readFileSync(new URL('../../package.json', moduleUrl), 'utf8')) as {
      readonly version?: unknown;
    };
    return typeof read.version === 'string' && read.version !== '' ? read.version : undefined;
  } catch {
    return undefined;
  }
}

export function compareVersions(a: string, b: string): number | undefined {
  const na = a.split('.').map((part) => Number.parseInt(part, 10));
  const nb = b.split('.').map((part) => Number.parseInt(part, 10));
  if (na.some(Number.isNaN) || nb.some(Number.isNaN)) return undefined;
  for (let index = 0; index < Math.max(na.length, nb.length); index += 1) {
    const left = na[index] ?? 0;
    const right = nb[index] ?? 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(latest: string, installed: string): boolean {
  if (latest === installed) return false;
  const compared = compareVersions(latest, installed);
  return compared === undefined ? true : compared > 0;
}
