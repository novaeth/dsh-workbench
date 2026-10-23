import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface ModuleBuildFacts {
  readonly artifacts: readonly { readonly path: string; readonly at: string | null }[];
  readonly builtAll: boolean;
  readonly stale: boolean;
}

function asExported(dir: string): readonly string[] {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      exports?: unknown;
    };
    const exported =
      typeof manifest.exports === 'object' && manifest.exports !== null
        ? Object.values(manifest.exports as Record<string, unknown>)
        : [];
    return exported.filter((one): one is string => typeof one === 'string');
  } catch {
    return [];
  }
}

function mtimeOf(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

function newestMtime(dir: string): number | undefined {
  let newest: number | undefined;
  const walk = (at: string): void => {
    let entries;
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const stamp = mtimeOf(full);
        if (stamp !== undefined && (newest === undefined || stamp > newest)) newest = stamp;
      }
    }
  };
  walk(dir);
  return newest;
}

export function moduleBuildFacts(dir: string): ModuleBuildFacts {
  const declared = asExported(dir);
  const artifacts = declared.map((rel) => ({ path: rel, mtime: mtimeOf(join(dir, rel)) }));
  const present = artifacts.filter((one) => one.mtime !== undefined);
  const oldestBuilt = present.reduce<number | undefined>(
    (min, one) => (min === undefined || (one.mtime as number) < min ? (one.mtime as number) : min),
    undefined,
  );
  const newestSource = newestMtime(join(dir, 'src'));
  return {
    artifacts: artifacts.map((one) => ({
      path: one.path,
      at: one.mtime === undefined ? null : new Date(one.mtime).toISOString(),
    })),
    builtAll: present.length === artifacts.length && artifacts.length > 0,
    stale: newestSource !== undefined && oldestBuilt !== undefined && newestSource > oldestBuilt,
  };
}
