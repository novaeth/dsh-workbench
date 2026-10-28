import type { Translate } from '../lib/dsh-client.js';

/**
 * 取当前语言的运行时术语。
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
