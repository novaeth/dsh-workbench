import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function dependencyReader(profileDir: string | null): (pkg: string) => string | undefined {
  if (profileDir === null) return () => undefined;
  let dependencies: Readonly<Record<string, unknown>> | undefined;
  return (pkg) => {
    if (dependencies === undefined) {
      try {
        const parsed = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
          readonly dependencies?: unknown;
        };
        const raw = parsed.dependencies;
        dependencies = typeof raw === 'object' && raw !== null ? (raw as Readonly<Record<string, unknown>>) : {};
      } catch {
        dependencies = {};
      }
    }
    const value = dependencies[pkg];
    return typeof value === 'string' ? value : undefined;
  };
}
