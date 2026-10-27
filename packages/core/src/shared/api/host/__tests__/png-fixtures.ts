import { deflateSync, inflateSync } from 'node:zlib';

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
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

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paethOf(left: number, above: number, corner: number): number {
  const estimate = left + above - corner;
  const toLeft = Math.abs(estimate - left);
  const toAbove = Math.abs(estimate - above);
  const toCorner = Math.abs(estimate - corner);
  if (toLeft <= toAbove && toLeft <= toCorner) return left;
  return toAbove <= toCorner ? above : corner;
}

function pixelOf(x: number, y: number): readonly number[] {
  return [(x * 11) & 0xff, (y * 23) & 0xff, (x * y * 7) & 0xff, 0xff];
}

function channelsOf(color: number): number {
  return CHANNELS[color] ?? 3;
}

export function fixtureOf(options: {
  width: number;
  height: number;
  color?: number;
  depth?: number;
  interlace?: number;
  filter?: number;
}): Buffer {
  const color = options.color ?? 6;
  const channels = channelsOf(color);
  const depth = options.depth ?? 8;
  const stride = options.width * channels;
  const pixels = Buffer.alloc(stride * options.height);
  for (let y = 0; y < options.height; y += 1) {
    for (let x = 0; x < options.width; x += 1) {
      const pixel = pixelOf(x, y);
      for (let c = 0; c < channels; c += 1) pixels[y * stride + x * channels + c] = pixel[c] ?? 0;
    }
  }
  const filter = options.filter ?? 0;
  const raw = Buffer.alloc((stride + 1) * options.height);
  for (let y = 0; y < options.height; y += 1) {
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? (pixels[y * stride + i - channels] ?? 0) : 0;
      const above = y === 0 ? 0 : (pixels[(y - 1) * stride + i] ?? 0);
      const corner = y === 0 || i < channels ? 0 : (pixels[(y - 1) * stride + i - channels] ?? 0);
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? (left + above) >> 1
                : paethOf(left, above, corner);
      raw[y * (stride + 1) + 1 + i] = ((pixels[y * stride + i] ?? 0) - predictor) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(options.width, 0);
  ihdr.writeUInt32BE(options.height, 4);
  ihdr[8] = depth;
  ihdr[9] = color;
  ihdr[12] = options.interlace ?? 0;
  return Buffer.concat([PNG_SIGNATURE, chunkOf('IHDR', ihdr), chunkOf('IDAT', deflateSync(raw)), chunkOf('IEND', Buffer.alloc(0))]);
}

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly pixels: Buffer;
}

export function pixelsOf(bytes: Buffer): Pixels {
  let at = 8;
  let width = 0;
  let height = 0;
  let color = 0;
  const parts: Buffer[] = [];
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      color = data[9] ?? 0;
    } else if (type === 'IDAT') parts.push(Buffer.from(data));
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const channels = channelsOf(color);
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) raw.copy(pixels, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  return { width, height, color, pixels };
}

export function blockOf(x: number, y: number, width: number, height: number, color: number): Buffer {
  const channels = channelsOf(color);
  const out = Buffer.alloc(width * channels * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const pixel = pixelOf(x + column, y + row);
      for (let c = 0; c < channels; c += 1) out[(row * width + column) * channels + c] = pixel[c] ?? 0;
    }
  }
  return out;
}
