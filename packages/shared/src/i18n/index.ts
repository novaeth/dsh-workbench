import { en } from './en.js';
import { zh, type WorkbenchMessages } from './zh.js';

/** 外壳自带的两份词表（`zh` 为基准、`en` 同构）：`client.tsx` 拿它当合并各套件词表的底座。 */
export const dictionaries = { zh, en };

/** 中文词表的键类型（从 `zh.ts` 转出）：`en` 与模块词表都得覆盖同一批键。 */
export type { WorkbenchMessages };

/** 一份按语言分的词表：`zh` / `en` 必须同键，另可带模块自己那份语言。 */
export interface Dictionaries {
  readonly zh: Readonly<Record<string, string>>;
  readonly en: Readonly<Record<string, string>>;
  readonly [language: string]: Readonly<Record<string, string>>;
}
