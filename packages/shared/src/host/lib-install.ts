import type { LibNeed, SupplySource } from '../contract/needs.js';
import { npmRegistryOf } from './plugin-source.js';
import { quoteShellArg } from './shell-text.js';
import { libsPrefix, npmCacheDir } from './paths.js';

export type NpmSource = Extract<SupplySource, { kind: 'npm' }>;

export function libInstallCommand(options: {
  readonly need: LibNeed;
  readonly source: NpmSource;
  readonly version?: string | undefined;
}): string {
  const { need, source, version } = options;
  const registry = npmRegistryOf(source, process.env);
  const spec = version ?? need.version ?? 'latest';
  const registryFlag = registry.ok ? ` --registry ${quoteShellArg(registry.value)}` : '';
  return `npm i --prefix ${quoteShellArg(libsPrefix())} ${quoteShellArg(`${need.name}@${spec}`)}${registryFlag} --cache ${quoteShellArg(npmCacheDir())}`;
}
