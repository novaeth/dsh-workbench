import { OPENCLI_PIN } from '../config/constants.js';
import type { UnitLibNeed } from '../api/unit.js';
import { quoteShellArg } from './shell-text.js';

import { dshHome, workbenchRoot } from './data-root.js';

export { dshHome };

export function isolatedRoot(): string {
  return `${workbenchRoot()}/opencli`;
}

export function isolatedHome(): string {
  return `${isolatedRoot()}/home`;
}

export const OPENCLI_NPM_PACKAGE = '@jackwener/opencli';

export function toolchainDir(): string {
  return `${isolatedRoot()}/toolchain`;
}

export function toolchainOpencliDir(): string {
  return `${toolchainDir()}/node_modules/${OPENCLI_NPM_PACKAGE}`;
}

export function vendorPrefix(): string {
  return `${isolatedRoot()}/plugins-npm`;
}

export function vendorPluginsDir(): string {
  return `${vendorPrefix()}/node_modules`;
}

export const OPENCLI_CATALOG_ENV = 'DSH_WB_OPENCLI_CATALOG';

export function cliCatalogPath(): string {
  const override = process.env[OPENCLI_CATALOG_ENV]?.trim();
  return override === undefined || override === ''
    ? `${toolchainOpencliDir()}/cli-manifest.json`
    : override;
}

export function vendorPeerLink(): { readonly dir: string; readonly parent: string } {
  const base = `${vendorPrefix()}/node_modules`;
  const [scope] = OPENCLI_NPM_PACKAGE.split('/');
  return { dir: `${base}/${OPENCLI_NPM_PACKAGE}`, parent: `${base}/${scope}` };
}

export function npmCacheDir(): string {
  return `${isolatedRoot()}/npm-cache`;
}

export function isolatedCommand(): string {
  const name = process.platform === 'win32' ? 'opencli.cmd' : 'opencli';
  return `${isolatedRoot()}/bin/${name}`;
}

export function libsPrefix(): string {
  return `${isolatedRoot()}/libs`;
}

export function libDir(name: string): string {
  return `${libsPrefix()}/node_modules/${name}`;
}

export function libInstallCommand(options: {
  readonly need: UnitLibNeed;
  readonly version?: string | undefined;
}): string {
  const { need, version } = options;
  const registry =
    process.env[need.registryEnv]?.trim() || need.registryDefault;
  const spec = version ?? need.version ?? 'latest';
  return `npm i --prefix ${quoteShellArg(libsPrefix())} ${quoteShellArg(`${need.name}@${spec}`)} --registry ${quoteShellArg(registry)} --cache ${quoteShellArg(npmCacheDir())}`;
}

export function isolatedInstallCommand(): string {
  return `npm i --prefix ${quoteShellArg(toolchainDir())} ${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --cache ${quoteShellArg(npmCacheDir())}`;
}

/**
 * Desktop 没有 npm 时的 opencli 安装命令：借 Desktop 自带的 pnpm，装进同一个隔离目录。
 * 只替换“安装 opencli”这一步；npm 仍用于 opencli 插件安装、模块库与 npm 检查。
 * @param pnpmCjs bundled pnpm 的 `pnpm.cjs` 绝对路径。
 * @returns 可直接交给 shell 的命令；`node` 由 Desktop 的 Node shim 提供。
 */
export function isolatedPnpmInstallCommand(pnpmCjs: string): string {
  const store = `${isolatedRoot()}/pnpm-store`;
  return (
    `node ${quoteShellArg(pnpmCjs)} add --dir ${quoteShellArg(toolchainDir())} ` +
    `${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --store-dir ${quoteShellArg(store)} ` +
    `--allow-build=${OPENCLI_NPM_PACKAGE}`
  );
}
