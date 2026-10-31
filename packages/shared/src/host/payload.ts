/**
 * 把任意 payload 当对象看；不是对象就回空对象。
 * @param value 任意入参。
 * @returns 可按下标取值的安全对象。
 */
export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * 把任意 payload 当一段文字看：字符串就 trim，别的都算空串。
 * @param value 任意入参。
 * @returns 去掉首尾空白的字符串；不是字符串时是空串。
 */
export function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
