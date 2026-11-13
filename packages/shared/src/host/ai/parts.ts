/**
 * 入参归一化：把模块给的图片（data URL / 绝对路径 / 字节）翻成适配器认的字节 + 媒体类型。
 *
 * @module dsh-workbench/shared/host/ai/parts
 */
import { readFile } from 'node:fs/promises';
import { aiError, type AiRequest, type ImageLike } from './types.js';
import type { AiPart } from './adapter.js';

const DATA_URL = /^data:([^;,]+)(;base64)?,(.*)$/s;
const KNOWN: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function mediaTypeOfPath(path: string): string | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return undefined;
}

function checkMediaType(mediaType: string): string {
  if (!KNOWN.includes(mediaType)) {
    throw aiError('unsupported-input', `不认的图片类型：${mediaType}（只认 ${KNOWN.join(' / ')}）`);
  }
  return mediaType;
}

export async function imagePartOf(one: ImageLike): Promise<AiPart & { readonly kind: 'image' }> {
  if (typeof one === 'string') {
    const matched = DATA_URL.exec(one);
    if (matched !== null) {
      const mediaType = checkMediaType(matched[1] ?? '');
      return {
        kind: 'image',
        data: new Uint8Array(Buffer.from(matched[3] ?? '', 'base64')),
        mediaType,
      };
    }
    if (!one.startsWith('/')) {
      throw aiError('unsupported-input', `图片只认 data URL 或绝对路径：${one.slice(0, 40)}`);
    }
    const mediaType = mediaTypeOfPath(one);
    if (mediaType === undefined) {
      throw aiError('unsupported-input', `从后缀看不出图片类型：${one}`);
    }
    return { kind: 'image', data: new Uint8Array(await readFile(one)), mediaType, name: one.split('/').pop() };
  }
  if (one instanceof Uint8Array) {
    return { kind: 'image', data: one, mediaType: 'image/png' };
  }
  return {
    kind: 'image',
    data: one.data,
    mediaType: checkMediaType(one.mediaType),
    ...(one.name === undefined ? {} : { name: one.name }),
  };
}

/**
 * 把一次请求拼成适配器认的内容：文字一截，后面每张图一截。
 * @param request 模块给的入参。
 * @returns 内容数组；空提示词也算一截文字。
 */
export async function partsOf(request: AiRequest): Promise<AiPart[]> {
  const parts: AiPart[] = [{ kind: 'text', text: request.prompt }];
  for (const one of request.images ?? []) parts.push(await imagePartOf(one));
  return parts;
}
