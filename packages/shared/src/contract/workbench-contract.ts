import type { PluginRelease } from '../contract/unit.js';

/**
 * 供给动作的那几档（装 / 升 / 卸，模块、共用依赖与插件各一套）；写口按它分派。
 */
export type ProvisionAction =
  | 'install'
  | 'update'
  | 'uninstall'
  | 'update-dependency'
  | 'install-bundle'
  | 'update-bundle'
  | 'remove-bundle'
  | 'cancel-install'
  | 'update-plugin'
  | 'uninstall-plugin'
  | 'update-workbench';

/**
 * 宿主报的一个 opencli 插件此刻的状态：装没装、缺哪些命令、该不该升，以及怎么升。
 */
export interface PluginStatePayload {
  readonly name: string;
  readonly status: 'ok' | 'outdated' | 'missing';
  readonly missing: readonly string[];
  readonly install?: 'ready' | 'not-declared' | 'env-missing' | 'malformed';
  readonly command?: string;
  readonly release?: PluginRelease;
}

/**
 * 宿主对「这个单元现在能不能用」的那份读数：状态、缺的命令与插件、修复动作和供给细节。
 */
export interface CapabilityPayload {
  readonly unit: string;
  readonly status: 'ok' | 'failed' | 'missing-commands' | 'missing-plugin' | 'unchecked';
  readonly plugin?: string;
  readonly required: readonly string[];
  readonly missing: readonly string[];
  readonly detail: string;
  readonly command?: string;
  readonly fix?: 'install' | 'update';
  readonly plugins?: readonly PluginStatePayload[];
  readonly released?: boolean;
  readonly install?: 'ready' | 'not-declared' | 'env-missing' | 'malformed';
  readonly libs?: readonly LibStatePayload[];
}

/**
 * 宿主报的一个共用库此刻的状态（装没装、版本对不对）与它为什么要这个版本。
 */
export interface LibStatePayload {
  readonly name: string;
  readonly purpose: string;
  readonly status: 'ok' | 'outdated' | 'missing' | 'unsatisfied';
  readonly installed?: string;
  readonly latest?: string;
  readonly command?: string;
}
