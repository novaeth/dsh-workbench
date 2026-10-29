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
  return `${workbenchRoot()}/${id}`;
}

export function runtimeLayoutOf(id: string): RuntimeLayout {
  const root = runtimeRootOf(id);
  const vendorPrefix = `${root}/plugins-npm`;
  const libsPrefix = `${root}/libs`;
  return {
    root,
    home: `${root}/home`,
    vendorPrefix,
    vendorPluginsDir: `${vendorPrefix}/node_modules`,
    libsPrefix,
    libsBinDir: `${libsPrefix}/node_modules/.bin`,
    npmCacheDir: `${root}/npm-cache`,
  };
}
