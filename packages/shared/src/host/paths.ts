import { delimiter } from 'node:path';
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

/**
 * 把隔离运行时的共用依赖 bin 目录放到 PATH 最前面（可执行文件都从这儿找）。
 * @param env 改哪份环境（默认当前进程）。
 * @returns 真的插进去了就 `true`；已经在里面就 `false`。
 */
export function ensureLibsBinOnPath(env: NodeJS.ProcessEnv = process.env): boolean {
  const dir = libsBinDir();
  const parts = (env.PATH ?? '').split(delimiter).filter((one) => one !== '');
  if (parts.includes(dir)) return false;
  env.PATH = [dir, ...parts].join(delimiter);
  return true;
}
