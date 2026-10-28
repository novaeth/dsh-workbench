import { workbenchRoot } from './data-root.js';

export function isolatedRoot(): string {
  return `${workbenchRoot()}/opencli`;
}

export function isolatedHome(): string {
  return `${isolatedRoot()}/home`;
}

export function vendorPrefix(): string {
  return `${isolatedRoot()}/plugins-npm`;
}

export function vendorPluginsDir(): string {
  return `${vendorPrefix()}/node_modules`;
}

export function libsPrefix(): string {
  return `${isolatedRoot()}/libs`;
}

export const OPENCLI_NPM_PACKAGE = '@jackwener/opencli';

export function toolchainOpencliDir(): string {
  return `${isolatedRoot()}/toolchain/node_modules/${OPENCLI_NPM_PACKAGE}`;
}

export function vendorPeerLink(): { readonly dir: string; readonly parent: string } {
  const base = `${vendorPrefix()}/node_modules`;
  const [scope] = OPENCLI_NPM_PACKAGE.split('/');
  return { dir: `${base}/${OPENCLI_NPM_PACKAGE}`, parent: `${base}/${scope}` };
}

export function npmCacheDir(): string {
  return `${isolatedRoot()}/npm-cache`;
}

export function libsBinDir(): string {
  return `${libsPrefix()}/node_modules/.bin`;
}

