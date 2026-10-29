import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cropPng, cropPngFile } from '../png-crop';
import { PNG_SIGNATURE, blockOf, fixtureOf, pixelsOf } from './png-fixtures';

describe('外壳自己解 PNG：五种滤波器都要解对', () => {
  for (const filter of [0, 1, 2, 3, 4]) {
    it(`★★ 源图用滤波器 ${String(filter)} 编的，裁出来还得是原像素（差一个就整块歪）`, () => {
      const source = fixtureOf({ width: 24, height: 16, filter });
      const cropped = cropPng(source, { x: 5, y: 3, width: 9, height: 7 });

      expect(cropped.ok).toBe(true);
      expect(cropped.width).toBe(9);
      expect(cropped.height).toBe(7);
      expect(pixelsOf(cropped.bytes).pixels.equals(blockOf(5, 3, 9, 7, 6))).toBe(true);
    });
  }
});

describe('裁剪的边界：贴边、1×1、矩形出格', () => {
  it('★ 左上角 / 右下角 / 1×1 都对得上', () => {
    const source = fixtureOf({ width: 20, height: 12 });

    expect(pixelsOf(cropPng(source, { x: 0, y: 0, width: 20, height: 12 }).bytes).pixels.equals(blockOf(0, 0, 20, 12, 6))).toBe(true);
    expect(pixelsOf(cropPng(source, { x: 19, y: 11, width: 1, height: 1 }).bytes).pixels.equals(blockOf(19, 11, 1, 1, 6))).toBe(true);
    expect(pixelsOf(cropPng(source, { x: 0, y: 0, width: 1, height: 1 }).bytes).pixels.equals(blockOf(0, 0, 1, 1, 6))).toBe(true);
    expect(pixelsOf(cropPng(source, { x: 17, y: 9, width: 3, height: 3 }).bytes).pixels.equals(blockOf(17, 9, 3, 3, 6))).toBe(true);
  });

  it('★ 矩形跑出图外 ⇒ 按边界收进来，并且说清收过（不静默给一张错位的）', () => {
    const source = fixtureOf({ width: 10, height: 8 });
    const cropped = cropPng(source, { x: -4, y: 6, width: 99, height: 99 });

    expect(cropped.ok).toBe(true);
    expect(cropped.clamped).toBe(true);
    expect(cropped.width).toBe(10);
    expect(cropped.height).toBe(2);
    expect(cropped.reason).toContain('超出图外');
    expect(pixelsOf(cropped.bytes).pixels.equals(blockOf(0, 6, 10, 2, 6))).toBe(true);
  });
});

describe('不认的形状一律当场拒（绝不返回一张看着像的错图）', () => {
  it('★ 隔行 / 16 位 / 调色板 / 不是 PNG / 缺 IHDR', () => {
    for (const source of [
      fixtureOf({ width: 8, height: 8, interlace: 1 }),
      fixtureOf({ width: 8, height: 8, depth: 16 }),
      fixtureOf({ width: 8, height: 8, color: 3 }),
      Buffer.from('这不是 PNG'),
      PNG_SIGNATURE,
    ]) {
      const cropped = cropPng(source, { x: 0, y: 0, width: 4, height: 4 });
      expect(cropped.ok, cropped.reason).toBe(false);
      expect(cropped.bytes).toHaveLength(0);
      expect(cropped.reason).not.toBe('');
    }
  });
});

describe('落盘那一层：读不到 / 写不回，都要说清', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-png-'));

  it('★ 文件在那儿就换掉它；不在 / 不是 PNG 就说读不到而不是假装裁过', () => {
    const good = join(root, 'good.png');
    writeFileSync(good, fixtureOf({ width: 12, height: 9 }));
    const cropped = cropPngFile(good, good, { x: 2, y: 2, width: 4, height: 4 });
    expect(cropped.ok).toBe(true);
    expect(pixelsOf(readFileSync(good)).pixels.equals(blockOf(2, 2, 4, 4, 6))).toBe(true);

    const junk = join(root, 'junk.png');
    writeFileSync(junk, '不是 PNG');
    expect(cropPngFile(junk, junk, { x: 0, y: 0, width: 1, height: 1 }).reason).toContain('不是一张 PNG');

    expect(cropPngFile(join(root, 'missing.png'), join(root, 'out.png'), { x: 0, y: 0, width: 1, height: 1 }).reason).toContain(
      '读不到那张截图',
    );
    rmSync(root, { recursive: true, force: true });
  });
});
