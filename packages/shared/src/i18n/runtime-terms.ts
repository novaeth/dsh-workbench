import type { Translate } from '../lib/dsh-client.js';
import type { RuntimeText } from '../contract/capabilities.js';

/**
 * 把适配器给的 zh / en 两份文案落到当前语言。
 * @param text 适配器档案里的那段话。
 * @param resolve dsh 的语言解析器；没有就取中文那份。
 * @returns 当前语言的那一段。
 */
export function resolveRuntimeText(text: RuntimeText, resolve?: (text: RuntimeText) => string): string {
  return resolve === undefined ? text.zh : resolve(text);
}

/**
 * 取当前语言的运行时术语（没给档案时的兜底）。
 * @param t 文案函数。
 * @returns `plugin` / `pluginOf` / `pluginThing` / `pluginArea` 四个名词短语。
 */
export function runtimeTermsOf(t: Translate): Readonly<Record<string, string>> {
  return {
    plugin: t('runtime.plugin'),
    pluginOf: t('runtime.pluginOf'),
    pluginThing: t('runtime.pluginThing'),
    pluginArea: t('runtime.pluginArea'),
  };
}
