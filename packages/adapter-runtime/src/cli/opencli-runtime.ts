import { join } from 'node:path';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { isolatedRoot, libsPrefix, npmCacheDir, toolchainOpencliDir } from '../foundation/paths.js';
import { OPENCLI_NPM_PACKAGE } from '../foundation/paths.js';



export function toolchainDir(): string {
  return join(isolatedRoot(), 'toolchain');
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
    ? join(toolchainOpencliDir(), 'cli-manifest.json')
    : override;
}

export function isolatedCommand(): string {
  const name = process.platform === 'win32' ? 'opencli.cmd' : 'opencli';
  return join(isolatedRoot(), 'bin', name);
}

export { libsPrefix } from '../foundation/paths.js';

export { libInstallCommand } from '../foundation/install.js';

export function libDir(name: string): string {
  return join(libsPrefix(), 'node_modules', name);
}

export function isolatedInstallCommand(): string {
  return `npm i --prefix ${quoteShellArg(toolchainDir())} ${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --cache ${quoteShellArg(npmCacheDir())}`;
}

export function isolatedPnpmInstallCommand(pnpmCjs: string): string {
  const store = join(isolatedRoot(), 'pnpm-store');
  return (
    `node ${quoteShellArg(pnpmCjs)} add --dir ${quoteShellArg(toolchainDir())} ` +
    `${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --store-dir ${quoteShellArg(store)} ` +
    `--allow-build=${OPENCLI_NPM_PACKAGE}`
  );
}

export { isolatedHome, isolatedRoot, libsBinDir, npmCacheDir, toolchainOpencliDir, vendorPeerLink, vendorPluginsDir, vendorPrefix } from '../foundation/paths.js';
export { OPENCLI_NPM_PACKAGE } from '../foundation/paths.js';
