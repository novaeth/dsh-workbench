import type { BinNeed, LibNeed, SupplySource } from '../contract/needs.js';
import type { HostOs } from '../contract/protocol/platform.js';
import { npmRegistryOf } from './npm-registry.js';
import { quoteShellArg } from './shell-text.js';

export type NpmSource = Extract<SupplySource, { kind: 'npm' }>;

export function libInstallCommand(options: {
  readonly need: LibNeed;
  readonly source: NpmSource;
  readonly version?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly prefix: string;
  readonly cacheDir?: string | undefined;
}): string {
  const { need, source, version } = options;
  const registry = npmRegistryOf(source, options.env ?? process.env);
  const spec = version ?? need.version ?? 'latest';
  const registryFlag = registry.ok ? ` --registry ${quoteShellArg(registry.value)}` : '';
  const cacheFlag = options.cacheDir === undefined ? '' : ` --cache ${quoteShellArg(options.cacheDir)}`;
  return `npm i --prefix ${quoteShellArg(options.prefix)} ${quoteShellArg(`${need.name}@${spec}`)}${registryFlag}${cacheFlag}`;
}

export function binInstallCommand(
  need: BinNeed,
  os: HostOs,
  env: NodeJS.ProcessEnv,
  prefix: string,
  cacheDir?: string,
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
    prefix,
    ...(cacheDir === undefined ? {} : { cacheDir }),
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

export function libUninstallCommand(options: { readonly need: LibNeed; readonly prefix: string }): string {
  return `npm uninstall --prefix ${quoteShellArg(options.prefix)} ${quoteShellArg(options.need.name)}`;
}
