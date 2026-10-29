import type { BinNeed, LibNeed, SupplySource } from '@dsh-workbench/shared';
import type { HostOs } from '@dsh-workbench/shared';
import { npmRegistryOf } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { libsPrefix, npmCacheDir } from './paths.js';

export type NpmSource = Extract<SupplySource, { kind: 'npm' }>;

export function libInstallCommand(options: {
  readonly need: LibNeed;
  readonly source: NpmSource;
  readonly version?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
}): string {
  const { need, source, version } = options;
  const registry = npmRegistryOf(source, options.env ?? process.env);
  const spec = version ?? need.version ?? 'latest';
  const registryFlag = registry.ok ? ` --registry ${quoteShellArg(registry.value)}` : '';
  return `npm i --prefix ${quoteShellArg(libsPrefix())} ${quoteShellArg(`${need.name}@${spec}`)}${registryFlag} --cache ${quoteShellArg(npmCacheDir())}`;
}

export function binInstallCommand(
  need: BinNeed,
  os: HostOs,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const install = need.install;
  if (install === undefined) return undefined;
  if (install.platforms !== undefined && !install.platforms.includes(os)) return undefined;
  if (install.kind === 'command') {
    const line = install.line.trim();
    return line === '' ? undefined : line;
  }
  const packageName = install.package.trim();
  if (packageName === '') return undefined;
  return libInstallCommand({
    need: { kind: 'lib', name: packageName, purpose: need.purpose },
    source: {
      kind: 'npm',
      package: packageName,
      ...(install.registryEnv === undefined ? {} : { registryEnv: install.registryEnv }),
      ...(install.registryDefault === undefined ? {} : { registryDefault: install.registryDefault }),
    },
    env,
  });
}

export function libUninstallCommand(options: { readonly need: LibNeed }): string {
  return `npm uninstall --prefix ${quoteShellArg(libsPrefix())} ${quoteShellArg(options.need.name)}`;
}
