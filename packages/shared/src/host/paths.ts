import { join } from 'node:path';
import { workbenchRoot } from './data-root.js';

export interface RuntimeLayout {
  readonly root: string;
  readonly home: string;
  readonly vendorPrefix: string;
  readonly vendorPluginsDir: string;
  readonly libsPrefix: string;
  readonly libsBinDir: string;
  readonly npmCacheDir: string;
}

export function runtimeRootOf(id: string): string {
  return join(workbenchRoot(), id);
}

export function runtimeLayoutOf(id: string): RuntimeLayout {
  const root = runtimeRootOf(id);
  const vendorPrefix = join(root, 'plugins-npm');
  const libsPrefix = join(root, 'libs');
  return {
    root,
    home: join(root, 'home'),
    vendorPrefix,
    vendorPluginsDir: join(vendorPrefix, 'node_modules'),
    libsPrefix,
    libsBinDir: join(libsPrefix, 'node_modules', '.bin'),
    npmCacheDir: join(root, 'npm-cache'),
  };
}
