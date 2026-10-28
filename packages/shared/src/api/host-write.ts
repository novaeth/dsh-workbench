import type { InstallFailure } from '../contract/command.js';

/**
 * 宿主写口的五条通道（偏好、动作、供给、工坊调试、工坊录制），是写路由的第一段。
 */
export type WriteChannel =
  | 'prefs'
  | 'actions'
  | 'provision'
  | 'diy-debug'
  | 'diy-record';

/**
 * 写通道统一的结果：成了带值，没成带一句能给人看的话（可选明细与帮助链接）；
 * 安装类的失败多带一份结构化现场，界面据此给修法。
 */
export type WriteOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly message: string;
      readonly detail?: string;
      readonly helpUrl?: string;
      readonly failure?: InstallFailure;
    };
