import { CONTEXT_MARKER_NAME, encodeRef, type ContextRef } from '../api/context-ref.js';

const MARKER = new RegExp(`@${CONTEXT_MARKER_NAME}:([a-z][a-z0-9-]*:[A-Za-z0-9._~%#/-]+)`, 'g');

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * 把 kind:part/part 文本读回引用。
 * @param text 待解析文本。
 * @returns 没冒号、冒号在首尾、种类不是小写字母开头、或冒号后为空时给 undefined；不抛异常。
 */
export function decodeRef(text: string): ContextRef | undefined {
  const at = text.indexOf(':');
  if (at <= 0 || at === text.length - 1) return undefined;
  const kind = text.slice(0, at);
  if (!/^[a-z][a-z0-9-]*$/.test(kind)) return undefined;
  const parts = text.slice(at + 1).split('/').filter((part) => part !== '');
  if (parts.length === 0) return undefined;
  return { kind, parts };
}

/**
 * 从一段文本里按出现顺序捞出所有标记引用，同一个引用只留第一次。
 * @param text 任意文本；null / undefined 当空串。
 * @returns 解析不出来的标记会被丢掉，所以结果只含合法引用，可能为空数组。
 */
export function parseMarkers(text: string): ContextRef[] {
  const seen = new Set<string>();
  const refs: ContextRef[] = [];
  for (const match of String(text ?? '').matchAll(MARKER)) {
    const raw = match[1].replace(TRAILING_PUNCTUATION, '');
    const ref = decodeRef(raw);
    if (ref === undefined) continue;
    const key = encodeRef(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}
