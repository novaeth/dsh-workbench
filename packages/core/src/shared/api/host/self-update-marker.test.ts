import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSelfUpdateMarker } from './self-update-marker';

function markerFile(body: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-marker-'));
  const file = join(dir, 'self-update.json');
  if (body !== undefined) writeFileSync(file, body);
  return file;
}

describe('readSelfUpdateMarker：外部换版留下的那一个文件', () => {
  it('★ 有 pkg 与 state → 读出来（调用方靠 pkg 确认是不是自己那一跳）', () => {
    const file = markerFile(JSON.stringify({ pkg: '@a/mod', state: 'ok', version: '1.2.3' }));
    expect(readSelfUpdateMarker(file)).toEqual({ pkg: '@a/mod', state: 'ok' });
  });

  it('文件不在 / 不是 JSON → 空对象（别抛给调用方）', () => {
    expect(readSelfUpdateMarker(markerFile(undefined))).toEqual({});
    expect(readSelfUpdateMarker(markerFile('not json'))).toEqual({});
  });

  it('字段类型不对 → 只回认得的那几个', () => {
    const file = markerFile(JSON.stringify({ pkg: 1, state: null }));
    expect(readSelfUpdateMarker(file)).toEqual({});
  });
});
