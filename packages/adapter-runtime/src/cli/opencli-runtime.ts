import { OPENCLI_PIN } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { isolatedRoot, libsPrefix, npmCacheDir, toolchainOpencliDir, vendorPrefix } from '../paths.js';
import { OPENCLI_NPM_PACKAGE } from '../paths.js';



export function toolchainDir(): string {
  return `${isolatedRoot()}/toolchain`;
}

export const OPENCLI_CATALOG_ENV = 'DSH_WB_OPENCLI_CATALOG';

export function toolchainManifestOf(): string {
  return `${JSON.stringify(
    {
      name: 'dsh-workbench-toolchain',
      private: true,
      dependencies: { [OPENCLI_NPM_PACKAGE]: OPENCLI_PIN },
    },
    null,
    2,
  )}\n`;
}

export function cliCatalogPath(): string {
  const override = process.env[OPENCLI_CATALOG_ENV]?.trim();
  return override === undefined || override === ''
    ? `${toolchainOpencliDir()}/cli-manifest.json`
    : override;
}

export function isolatedCommand(): string {
  const name = process.platform === 'win32' ? 'opencli.cmd' : 'opencli';
  return `${isolatedRoot()}/bin/${name}`;
}

export { libsPrefix } from '../paths.js';

export { libInstallCommand } from '../install.js';

export function libDir(name: string): string {
  return `${libsPrefix()}/node_modules/${name}`;
}

export function isolatedInstallCommand(): string {
  return `npm i --prefix ${quoteShellArg(toolchainDir())} ${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --cache ${quoteShellArg(npmCacheDir())}`;
}

export function isolatedPnpmInstallCommand(pnpmCjs: string): string {
  const store = `${isolatedRoot()}/pnpm-store`;
  return (
    `node ${quoteShellArg(pnpmCjs)} add --dir ${quoteShellArg(toolchainDir())} ` +
    `${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --store-dir ${quoteShellArg(store)} ` +
    `--allow-build=${OPENCLI_NPM_PACKAGE}`
  );
}

export { isolatedHome, isolatedRoot, libsBinDir, npmCacheDir, toolchainOpencliDir, vendorPeerLink, vendorPluginsDir, vendorPrefix } from '../paths.js';
export { OPENCLI_NPM_PACKAGE } from '../paths.js';
