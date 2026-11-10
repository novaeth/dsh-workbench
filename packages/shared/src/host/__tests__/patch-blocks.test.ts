import { describe, expect, it } from 'vitest';
import { patchBlocks, spannedBlocks } from '../patch-blocks.js';

const LF = ['- insert:', '  - id: ui-sidebar', '- id: ui-shell', '  name: shell', ''].join('\n');

const CRLF = ['- insert:', '  - id: ui-sidebar', '- id: ui-shell', '  name: shell', ''].join('\r\n');

describe('patch 分块：行尾 CRLF 与 LF 同解', () => {
  it('CRLF 下 - insert: 仍然算 insert 块（Windows 上记事本存过就是 CRLF）', () => {
    const [insert] = patchBlocks(CRLF);
    expect(insert?.insert).toBe(true);
    expect(insert?.key).toBe('insert:ui-sidebar');
  });

  it('LF 下结论一致', () => {
    const [insert] = patchBlocks(LF);
    expect(insert?.insert).toBe(true);
    expect(insert?.key).toBe('insert:ui-sidebar');
  });

  it('CRLF 下 id 块的 id 不带回车', () => {
    const blocks = patchBlocks(CRLF);
    expect(blocks.map((one) => one.key)).toEqual(['insert:ui-sidebar', 'id:ui-shell']);
    expect(blocks[1]?.id).toBe('ui-shell');
    expect(blocks[1]?.names).toEqual(['shell']);
  });

  it('CRLF 与 LF 的分块行号一致（调用点按 from/to 回原文切片）', () => {
    const lf = spannedBlocks(LF).map((one) => [one.from, one.to]);
    const crlf = spannedBlocks(CRLF).map((one) => [one.from, one.to]);
    expect(crlf).toEqual(lf);
    expect(crlf).toEqual([
      [0, 2],
      [2, 5],
    ]);
  });
});
