function candidateStarts(raw: string): number[] {
  const starts: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== '[' && char !== '{') continue;
    if (index === 0 || raw[index - 1] === '\n') starts.push(index);
  }
  const earliest = [raw.indexOf('['), raw.indexOf('{')].filter((index) => index >= 0);
  if (earliest.length > 0) {
    const head = Math.min(...earliest);
    if (!starts.includes(head)) starts.push(head);
  }
  return starts;
}

/**
 * 宽松解析一段前后可能夹着人话的 JSON：整段不通就从行首的 `[` / `{` 起、截到最后一个闭合符再试。
 * @param text - 原文；`null` / `undefined` 当空串。
 * @returns 解析出的值（对象 / 数组 / 标量都原样）；空输入或怎么都解析不出给 `undefined`，调用方据此报「输出认不出」。
 */
export function parseJsonLoose(text: string | null | undefined): unknown {
  const raw = String(text ?? '').trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    for (const from of candidateStarts(raw)) {
      const close = raw[from] === '[' ? ']' : '}';
      const to = raw.lastIndexOf(close);
      if (to <= from) continue;
      try {
        return JSON.parse(raw.slice(from, to + 1)) as unknown;
      } catch {
        continue;
      }
    }
    return undefined;
  }
}

const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_MARKS = /[*`_>#]/g;

/**
 * 把一段 Markdown 压成一行纯文本摘要：图片剥掉、链接只留可见文字、标记符号压成空格，超长按字符截断。
 * @param text - 原文；`null` / `undefined` 当空串。
 * @param limit - 摘要最多多少字符，默认 80。
 * @returns 单行摘要；没超限原样给，超了截到 `limit` 并补省略号（总长 `limit + 1`；第 `limit` 个字符是空白时会被 `trimEnd` 去掉、略短），空输入给空串。
 */
export function excerpt(text: string | null | undefined, limit = 80): string {
  const flat = String(text ?? '')
    .replace(MARKDOWN_IMAGE, ' ')
    .replace(MARKDOWN_LINK, '$1')
    .replace(MARKDOWN_MARKS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).trimEnd()}…`;
}
