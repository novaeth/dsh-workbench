import type { Dictionaries } from './index.js';

/** 一个套件交上来的词表：`unit` 是套件 id（也是键前缀），`messages` 缺省表示这次不参与合并。 */
export interface MessagesContribution {
  readonly unit: string;
  readonly messages?: Dictionaries | undefined;
}

function assertSelfConsistent(unit: string, messages: Dictionaries): void {
  const zhKeys = Object.keys(messages.zh).sort();
  const enKeys = Object.keys(messages.en).sort();
  if (zhKeys.length !== enKeys.length || zhKeys.some((key, index) => key !== enKeys[index])) {
    throw new Error(
      `套件 ${unit} 的文案两语言不同构：zh ${zhKeys.length} 键 / en ${enKeys.length} 键`,
    );
  }
  for (const [language, dictionary] of [
    ['zh', messages.zh],
    ['en', messages.en],
  ] as const) {
    for (const [key, value] of Object.entries(dictionary)) {
      if (value.trim() === '') throw new Error(`套件 ${unit} 的文案 ${language}.${key} 是空的`);
    }
  }
}

/** 把各套件的词表合到外壳底座上：键必须以 `<unit>.` 开头、不许撞已有键，违规当场抛错。 */
export function mergeMessages(
  base: Dictionaries,
  contributions: readonly MessagesContribution[],
): Dictionaries {
  const zh: Record<string, string> = { ...base.zh };
  const en: Record<string, string> = { ...base.en };
  const owner = new Map<string, string>(Object.keys(base.zh).map((key) => [key, '外壳']));

  for (const item of contributions) {
    const messages = item.messages;
    if (messages === undefined) continue;
    assertSelfConsistent(item.unit, messages);

    for (const [key, value] of Object.entries(messages.zh)) {
      if (!key.startsWith(`${item.unit}.`)) {
        throw new Error(`套件 ${item.unit} 的文案键必须以 "${item.unit}." 开头：${key}`);
      }
      const previous = owner.get(key);
      if (previous !== undefined) {
        throw new Error(`文案键冲突：${key} 由 ${previous} 与 ${item.unit} 同时声明`);
      }
      owner.set(key, item.unit);
      zh[key] = value;
      en[key] = messages.en[key] ?? '';
    }
  }

  return { zh, en };
}

/** 一条没合进去的贡献：哪个套件 + 为什么被拒（人话原因）。 */
export interface MessagesProblem {
  readonly unit: string;
  readonly reason: string;
}

/** 合并结果：合出来的词表 + 被跳过的贡献；`problems` 为空即全部合上了。 */
export interface MessagesMerge {
  readonly dictionaries: Dictionaries;
  readonly problems: readonly MessagesProblem[];
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : String(error);
}

/** 逐份试合、坏的跳过：一份贡献不合规只记进 `problems`，不影响其余套件与已有词表。 */
export function mergeMessagesSkipping(
  base: Dictionaries,
  contributions: readonly MessagesContribution[],
): MessagesMerge {
  let dictionaries = base;
  const accepted: MessagesContribution[] = [];
  const problems: MessagesProblem[] = [];

  for (const item of contributions) {
    if (item.messages === undefined) continue;
    try {
      dictionaries = mergeMessages(base, [...accepted, item]);
      accepted.push(item);
    } catch (error) {
      problems.push({ unit: item.unit, reason: reasonOf(error) });
    }
  }

  return { dictionaries, problems };
}
