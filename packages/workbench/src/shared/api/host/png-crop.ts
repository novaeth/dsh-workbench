import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export interface PngRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PngCrop {
  readonly ok: boolean;
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
  readonly clamped: boolean;
  readonly reason: string;
}

export interface PngCropFile {
  readonly ok: boolean;
  readonly clamped: boolean;
  readonly reason: string;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let value = -1;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ -1) >>> 0;
}

function chunkOf(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

function paethOf(left: number, above: number, corner: number): number {
  const estimate = left + above - corner;
  const toLeft = Math.abs(estimate - left);
  const toAbove = Math.abs(estimate - above);
  const toCorner = Math.abs(estimate - corner);
  if (toLeft <= toAbove && toLeft <= toCorner) return left;
  return toAbove <= toCorner ? above : corner;
}

interface Header {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly color: number;
  readonly interlace: number;
  readonly channels: number;
}

function headerOf(bytes: Buffer): { readonly header: Header } | { readonly reason: string } {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) return { reason: '不是一张 PNG' };
  let at = 8;
  let raw: { width: number; height: number; depth: number; color: number; interlace: number } | undefined;
  const parts: Buffer[] = [];
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      raw = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8] ?? 0,
        color: data[9] ?? 0,
        interlace: data[12] ?? 0,
      };
    } else if (type === 'IDAT') {
      parts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (raw === undefined) return { reason: '这张 PNG 没有 IHDR' };
  const channels = CHANNELS[raw.color] ?? 0;
  if (raw.depth !== 8 || channels === 0) {
    return { reason: `这张 PNG 的形状不认（位深 ${String(raw.depth)} / 颜色类型 ${String(raw.color)}）` };
  }
  if (raw.interlace !== 0) return { reason: '这张 PNG 是隔行的，不认' };
  return { header: { ...raw, channels } };
}

function rowsOf(header: Header, parts: readonly Buffer[], keep: number): Buffer {
  const stride = header.width * header.channels;
  const inflated = inflateSync(Buffer.concat(parts));
  const above = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const out = Buffer.alloc(stride * keep);
  let at = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = inflated[at] ?? 0;
    const line = inflated.subarray(at + 1, at + 1 + stride);
    at += 1 + stride;
    for (let i = 0; i < stride; i += 1) {
      const source = line[i] ?? 0;
      const left = i >= header.channels ? (current[i - header.channels] ?? 0) : 0;
      const up = above[i] ?? 0;
      const corner = i >= header.channels ? (above[i - header.channels] ?? 0) : 0;
      const value =
        filter === 0
          ? source
          : filter === 1
            ? source + left
            : filter === 2
              ? source + up
              : filter === 3
                ? source + ((left + up) >> 1)
                : source + paethOf(left, up, corner);
      current[i] = value & 0xff;
    }
    if (y < keep) current.copy(out, y * stride);
    above.set(current);
    if (y + 1 >= keep) break;
  }
  return out;
}

function encodeOf(width: number, height: number, color: number, pixels: Buffer): Buffer {
  const stride = width * (CHANNELS[color] ?? 3);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = color;
  return Buffer.concat([
    SIGNATURE,
    chunkOf('IHDR', ihdr),
    chunkOf('IDAT', deflateSync(raw, { level: 9 })),
    chunkOf('IEND', Buffer.alloc(0)),
  ]);
}

export function cropPng(bytes: Buffer, rect: PngRect): PngCrop {
  const found = headerOf(bytes);
  if ('reason' in found) {
    return { ok: false, bytes: Buffer.alloc(0), width: 0, height: 0, clamped: false, reason: found.reason };
  }
  const { header } = found;
  const x = Math.max(0, Math.min(header.width - 1, Math.trunc(rect.x)));
  const y = Math.max(0, Math.min(header.height - 1, Math.trunc(rect.y)));
  const width = Math.max(1, Math.min(header.width - x, Math.trunc(rect.width)));
  const height = Math.max(1, Math.min(header.height - y, Math.trunc(rect.height)));
  const clamped = x !== Math.trunc(rect.x) || y !== Math.trunc(rect.y) || width !== Math.trunc(rect.width) || height !== Math.trunc(rect.height);
  const parts: Buffer[] = [];
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (type === 'IDAT') parts.push(Buffer.from(bytes.subarray(at + 8, at + 8 + length)));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const stride = header.width * header.channels;
  const rows = rowsOf(header, parts, y + height);
  const outStride = width * header.channels;
  const pixels = Buffer.alloc(outStride * height);
  for (let row = 0; row < height; row += 1) {
    const from = (y + row) * stride + x * header.channels;
    rows.copy(pixels, row * outStride, from, from + outStride);
  }
  return {
    ok: true,
    bytes: encodeOf(width, height, header.color, pixels),
    width,
    height,
    clamped,
    reason: clamped ? '矩形超出图外，已经按边界收进来' : '',
  };
}

export function cropPngFile(input: string, output: string, rect: PngRect): PngCropFile {
  let source: Buffer;
  try {
    source = readFileSync(input);
  } catch (error) {
    return { ok: false, clamped: false, reason: `读不到那张截图：${error instanceof Error ? error.message : String(error)}` };
  }
  const cropped = cropPng(source, rect);
  if (!cropped.ok) return { ok: false, clamped: false, reason: cropped.reason };
  try {
    writeFileSync(output, cropped.bytes);
  } catch (error) {
    return { ok: false, clamped: false, reason: `裁好的图写不回去：${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true, clamped: cropped.clamped, reason: cropped.reason };
}
