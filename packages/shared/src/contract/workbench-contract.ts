import type { NeedState } from '../contract/unit-capability.js';

/**
 * 供给动作的那几档（装 / 升 / 卸，模块、共用依赖与插件各一套）；写口按它分派。
 */
export type ProvisionAction =
  | 'install'
  | 'update'
  | 'uninstall'
  | 'update-dependency'
  | 'install-bundle'
  | 'install-version'
  | 'update-bundle'
  | 'remove-bundle'
  | 'cancel-install'
  | 'update-plugin'
  | 'uninstall-plugin'
  | 'update-workbench'
  | 'migrate-workbench'
  | 'dismiss-followup';

/**
 * 宿主对「这个单元现在能不能用」的那份读数：状态汇总加逐条 need 的细节。
 */
export interface CapabilityPayload {
  readonly unit: string;
  readonly status: 'ok' | 'degraded' | 'missing' | 'outdated' | 'unchecked' | 'unsupported' | 'failed';
  readonly needs: readonly NeedState[];
  readonly detail?: string;
  readonly released?: boolean;
}

