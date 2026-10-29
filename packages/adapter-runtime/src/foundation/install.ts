import type { BinNeed, LibNeed } from '@dsh-workbench/shared';
import type { HostOs } from '@dsh-workbench/shared';
import {
  binInstallCommand as binAt,
  libInstallCommand as libAt,
  libUninstallCommand as uninstallAt,
  type NpmSource,
} from '@dsh-workbench/shared/host';
import { libsPrefix, npmCacheDir } from './paths.js';

export type { NpmSource };

export function libInstallCommand(options: {
  readonly need: LibNeed;
  readonly source: NpmSource;
  readonly version?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
}): string {
  return libAt({ ...options, prefix: libsPrefix(), cacheDir: npmCacheDir() });
}

export function binInstallCommand(
  need: BinNeed,
  os: HostOs,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return binAt(need, os, env, libsPrefix(), npmCacheDir());
}

export function libUninstallCommand(options: { readonly need: LibNeed }): string {
  return uninstallAt({ need: options.need, prefix: libsPrefix() });
}
