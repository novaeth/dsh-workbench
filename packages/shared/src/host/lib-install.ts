import type { BinNeed, LibNeed, SupplySource } from '../contract/needs.js';
import type { HostOs } from '../contract/protocol/platform.js';
import { npmRegistryOf } from './plugin-source.js';
import { quoteShellArg } from './shell-text.js';
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

/**
 * 这个 bin 在这台机器上怎么装：作者写了 `install` 且平台对得上才给出那条命令。
 * `command` 原样照抄；`npm` 装进隔离运行时的共用依赖前缀（那份包里的 bin 会自动上 PATH）。
 * @param need 一条 bin 需要。
 * @param os 宿主平台（由平台适配器给出）。
 * @param env 取 registry 环境变量的地方。
 * @returns 一条能直接粘进终端的命令；没声明或平台不对就是 undefined。
 */
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
