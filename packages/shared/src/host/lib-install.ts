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
  readonly pnpm?: string | undefined;
}): string {
  const { need, source, version } = options;
  const pnpm = options.pnpm ?? process.env.DSH_WB_PNPM?.trim() ?? 'pnpm';
  const registry = npmRegistryOf(source, options.env ?? process.env);
  const spec = version ?? need.version ?? 'latest';
  const registryFlag = registry.ok ? ` --registry ${quoteShellArg(registry.value)}` : '';
  const storeFlag = options.cacheDir === undefined ? '' : ` --store-dir ${quoteShellArg(options.cacheDir)}`;
  return `${pnpm} add --dir ${quoteShellArg(options.prefix)} ${quoteShellArg(`${need.name}@${spec}`)}${registryFlag}${storeFlag} --allow-build=${quoteShellArg(need.name)}`;
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
  return `pnpm remove --dir ${quoteShellArg(options.prefix)} ${quoteShellArg(options.need.name)}`;
}
