import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ensureDir,
  makeExecutable,
  writeBytesFile,
  writeBytesFileAsync,
  writeJsonFile,
  writeJsonFileAsync,
  writeTextFile,
  writeTextFileAsync,
} from '../fs-write.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-fs-write-'));

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe('宿主文件写入口', () => {
  it('写文本：建父目录、原子落盘、内容正确', () => {
    const file = join(ROOT, 'a', 'b', 'note.txt');
    writeTextFile(file, 'hello');
    expect(readFileSync(file, 'utf8')).toBe('hello');
    expect(readdirSync(join(ROOT, 'a', 'b'))).toEqual(['note.txt']);
  });

  it('mode 默认保留已有文件的权限位', () => {
    const file = join(ROOT, 'secret.txt');
    writeFileSync(file, 'old', { mode: 0o600 });
    writeTextFile(file, 'new');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('显式 mode 生效，可执行文件 0755', () => {
    const secret = join(ROOT, 'explicit.txt');
    writeTextFile(secret, 's', { mode: 0o600 });
    expect(statSync(secret).mode & 0o777).toBe(0o600);
    const script = join(ROOT, 'bin', 'run.sh');
    writeTextFile(script, '#!/bin/sh\n', { mode: 0o755 });
    expect(statSync(script).mode & 0o777).toBe(0o755);
    const plain = join(ROOT, 'plain.sh');
    writeTextFile(plain, '#!/bin/sh\n');
    makeExecutable(plain);
    expect(statSync(plain).mode & 0o777).toBe(0o755);
  });

  it('JSON：两空格缩进 + 末尾换行', () => {
    const file = join(ROOT, 'state.json');
    writeJsonFile(file, { a: 1, list: [2] });
    expect(readFileSync(file, 'utf8')).toBe('{\n  "a": 1,\n  "list": [\n    2\n  ]\n}\n');
  });

  it('atomic:false 直接写，不建父目录', () => {
    const file = join(ROOT, 'direct.txt');
    writeTextFile(file, 'x', { atomic: false });
    expect(readFileSync(file, 'utf8')).toBe('x');
    expect(() => writeTextFile(join(ROOT, 'missing', 'deep.txt'), 'x', { atomic: false, mkdir: false })).toThrow();
  });

  it('二进制写：字节原样落盘', () => {
    const file = join(ROOT, 'img.bin');
    writeBytesFile(file, new Uint8Array([0, 255, 7]));
    expect([...readFileSync(file)]).toEqual([0, 255, 7]);
  });

  it('异步版语义一致', async () => {
    const file = join(ROOT, 'async.json');
    await writeJsonFileAsync(file, { ok: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ok: true });
    const text = join(ROOT, 'async.txt');
    await writeTextFileAsync(text, 'a');
    expect(readFileSync(text, 'utf8')).toBe('a');
    const bin = join(ROOT, 'async.bin');
    await writeBytesFileAsync(bin, new Uint8Array([1, 2]));
    expect([...readFileSync(bin)]).toEqual([1, 2]);
  });

  it('并发写同一文件：结果完整，不残留临时文件', async () => {
    const file = join(ROOT, 'race.txt');
    await Promise.all(Array.from({ length: 12 }, (_, i) => writeTextFileAsync(file, `v${String(i)}`)));
    expect(readFileSync(file, 'utf8')).toMatch(/^v\d+$/);
    expect(readdirSync(ROOT).filter((name) => name.startsWith('race.txt'))).toEqual(['race.txt']);
  });

  it('ensureDir 幂等', () => {
    const dir = join(ROOT, 'x', 'y');
    ensureDir(dir);
    ensureDir(dir);
    writeFileSync(join(dir, 'f'), '', 'utf8');
    chmodSync(join(dir, 'f'), 0o644);
    expect(readdirSync(dir)).toEqual(['f']);
  });
});
