/**
 * 引用标记的固定名字；完整标记是 @<这个名字>:<编码文本>，改它等于作废历史会话里已写下的引用。
 */
export const CONTEXT_MARKER_NAME = '工作台';

/**
 * 一条解析后的引用（种类加路径分段）：输入框写标记时产出，跳转与展示时消费。
 */
export interface ContextRef {
  readonly kind: string;
  readonly parts: readonly string[];
}

/**
 * 把引用拼回标记体里的那一段文本（不含 @ 与标记名）。
 * @param ref 要拼的引用。
 * @returns 形如 kind:part/part；分段里的 / 不转义，所以分段名本身不能含 /。
 */
export function encodeRef(ref: ContextRef): string {
  return `${ref.kind}:${ref.parts.join('/')}`;
}

/**
 * 拼出 @ 后面那半截（标记名加已编码文本），比较与拼接都用它。
 * @param encoded encodeRef 的结果。
 * @returns 形如 工作台:file:src/a.ts。
 */
export function markerBody(encoded: string): string {
  return `${CONTEXT_MARKER_NAME}:${encoded}`;
}

/**
 * 把一条引用拼成能写进对话文本的完整标记。
 * @param ref 要标记的引用。
 * @returns 形如 @工作台:file:src/a.ts 的一段文本。
 */
export function buildMarker(ref: ContextRef): string {
  return `@${markerBody(encodeRef(ref))}`;
}
