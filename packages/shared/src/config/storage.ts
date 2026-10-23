/** 读 localStorage 里的一段文本；没有这个键、或存储不可用（隐私模式）时返回 null。 */
export function readText(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 写一段文本进 localStorage；`value` 为 null 时删掉这个键，写不进去就静默作罢。 */
export function writeText(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
  }
}
