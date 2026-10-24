import type { UnitLibNeed } from '../contract/unit.js';
import { quoteShellArg } from './shell-text.js';
import { libsPrefix, npmCacheDir } from './paths.js';

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
