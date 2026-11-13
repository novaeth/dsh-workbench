import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_NPM_REGISTRY,
  OPENCLI_CATALOG_ENV,
  OPENCLI_PIN,
  OPENCLI_REGISTRY_ENV,
} from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { isolatedRoot, libsPrefix, storeDirFor, toolchainOpencliDir } from '../foundation/paths.js';
import { OPENCLI_NPM_PACKAGE } from '../foundation/paths.js';



export function toolchainDir(): string {
  return join(isolatedRoot(), 'toolchain');
}

export { OPENCLI_CATALOG_ENV };

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

export function toolchainNpmrcOf(): string {
  const override = process.env[OPENCLI_REGISTRY_ENV]?.trim();
  const asked = override === undefined || override === '' ? DEFAULT_NPM_REGISTRY : override;
  const registry = asked.endsWith('/') ? asked : `${asked}/`;
  return `${OPENCLI_NPM_PACKAGE.split('/')[0]}:registry=${registry}\n`;
}

function packageVersionOf(file: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const version = (parsed as Record<string, unknown>)['version'];
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function opencliReadiness(): { readonly ready: boolean; readonly detail: string } {
  const dir = toolchainOpencliDir();
  if (!existsSync(join(dir, 'package.json'))) return { ready: false, detail: '隔离副本不在' };
  if (!existsSync(join(dir, 'dist', 'src', 'main.js'))) {
    return { ready: false, detail: '隔离副本缺 dist/src/main.js' };
  }
  const version = packageVersionOf(join(dir, 'package.json'));
  if (version !== OPENCLI_PIN) {
    return { ready: false, detail: `隔离副本是 ${version ?? '读不到的版本'}，要 ${OPENCLI_PIN}` };
  }
  return { ready: true, detail: OPENCLI_PIN };
}

export function isOpencliReady(): boolean {
  return opencliReadiness().ready;
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

export function pnpmIsolationFlags(): string {
  return (
    `--config.cache-dir=${quoteShellArg(join(isolatedRoot(), 'pnpm-cache'))} ` +
    `--config.state-dir=${quoteShellArg(join(isolatedRoot(), 'pnpm-state'))}`
  );
}

export function isolatedInstallCommand(): string {
  const pnpm = process.env.DSH_WB_PNPM?.trim() || 'pnpm';
  return `${pnpm} add --dir ${quoteShellArg(toolchainDir())} ${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --store-dir ${quoteShellArg(storeDirFor(toolchainDir()))} ${pnpmIsolationFlags()} --allow-build=${OPENCLI_NPM_PACKAGE} --save-exact`;
}

export function isolatedPnpmInstallCommand(pnpmCjs: string): string {
  const store = storeDirFor(toolchainDir());
  return (
    `node ${quoteShellArg(pnpmCjs)} add --dir ${quoteShellArg(toolchainDir())} ` +
    `${OPENCLI_NPM_PACKAGE}@${OPENCLI_PIN} --store-dir ${quoteShellArg(store)} ` +
    `${pnpmIsolationFlags()} --allow-build=${OPENCLI_NPM_PACKAGE} --save-exact`
  );
}

export { isolatedHome, isolatedRoot, libsBinDir, npmCacheDir, toolchainOpencliDir, vendorPeerLink, vendorPluginsDir, vendorPrefix } from '../foundation/paths.js';
export { OPENCLI_NPM_PACKAGE } from '../foundation/paths.js';
