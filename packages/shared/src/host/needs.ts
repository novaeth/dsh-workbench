import type { BinNeed } from '../contract/needs.js';
import type { HostOs } from '../contract/protocol/platform.js';

export type { NeedKindSpec as NeedKindSpecOf } from '../contract/needs.js';
export type NeedProbe = 'bin' | 'extension' | 'package' | 'env';

export { NEED_KIND_SPECS } from '../contract/needs.js';

export const NEED_PROBES: readonly NeedProbe[] = ['bin', 'extension', 'package', 'env'];

/**
 * 这个 bin 需要在这台机器上怎么装：作者写了 `install` 且平台对得上才给出那条命令。
 * @param need 一条 bin 需要。
 * @param os 宿主平台（由平台适配器给出）。
 * @returns 一条能直接粘进终端的命令；没声明或平台不对就是 undefined。
 */
export function binInstallCommand(need: BinNeed, os: HostOs): string | undefined {
  const install = need.install;
  if (install === undefined) return undefined;
  if (install.platforms !== undefined && !install.platforms.includes(os)) return undefined;
  const line = install.line.trim();
  return line === '' ? undefined : line;
}
