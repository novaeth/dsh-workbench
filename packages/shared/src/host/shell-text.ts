/**
 * 按目标平台把一个值裹成 shell 字面量：POSIX 用单引号，win32 用双引号（cmd 与 PowerShell 都认）。
 * @param value - 任意值；不是字符串的先 `String()`。
 * @param platform - 目标平台，默认当前 `process.platform`。
 * @returns 可安全拼进该平台 shell 命令的一段文本；含空格 / 元字符的值不会被当成语法。
 */
export function quoteShellArgFor(value: unknown, platform: NodeJS.Platform = process.platform): string {
  const text = String(value);
  if (platform === 'win32') return `"${text.replace(/"/g, '\\"')}"`;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * 按当前平台把值裹成 shell 字面量；跨平台代码要固定平台时用 `quoteShellArgFor`。
 * @param value - 任意值；不是字符串的先 `String()`。
 * @returns 可安全拼进当前平台 shell 命令的一段文本。
 */
export function quoteShellArg(value: unknown): string {
  return quoteShellArgFor(value, process.platform);
}

/**
 * 取一段文本的末尾若干行（如命令输出），顺带去掉首尾空白。
 * @param text - 原文；`null` / `undefined` 当空串。
 * @param lines - 最多留几行，默认 6；0 给全篇、负数从开头砍掉那么多行（都是 `slice` 语义），调用方传正数。
 * @returns 末尾若干行、去首尾空行后的文本；原文行数不够就全给，空输入给空串。
 */
export function tailLines(text: string | null | undefined, lines = 6): string {
  const all = String(text ?? '')
    .trim()
    .split('\n');
  return all.slice(-lines).join('\n');
}
