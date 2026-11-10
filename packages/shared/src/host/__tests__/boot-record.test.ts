import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootFileIn, readBootRecord, upFileIn, workbenchBootFile, workbenchUpFile, writeBootRecord } from '../boot-record.js';

const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-boot-record-'));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('启动记录：这一版到底起没起来', () => {
  it('写进去读得出来；坏了 / 缺字段一律当没有', () => {
    const file = join(dir, 'one.json');
    writeBootRecord({ version: '1.2.3-beta.3', at: '2026-11-10T12:00:00.000Z', pid: 42 }, file);
    expect(readBootRecord(file)).toEqual({ version: '1.2.3-beta.3', at: '2026-11-10T12:00:00.000Z', pid: 42 });
    expect(readBootRecord(join(dir, '没有这个.json'))).toBeUndefined();
    writeFileSync(file, '{ 不是 JSON');
    expect(readBootRecord(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ at: '2026-11-10T12:00:00.000Z' }));
    expect(readBootRecord(file)).toBeUndefined();
  });

  it('两条记录落在工作台那本目录里，名字分得清', () => {
    vi.stubEnv('DSH_WORKBENCH_HOME', join(dir, 'workbench'));
    expect(workbenchBootFile()).toBe(bootFileIn(join(dir, 'workbench')));
    expect(workbenchUpFile()).toBe(upFileIn(join(dir, 'workbench')));
    expect(workbenchBootFile()).not.toBe(workbenchUpFile());
    expect(workbenchBootFile().endsWith('self-update-boot.json')).toBe(true);
    expect(workbenchUpFile().endsWith('self-update-up.json')).toBe(true);
  });

  it('写记录会把目录建出来（第一次启动时那本目录可能还不存在）', () => {
    const file = join(dir, 'fresh', 'nested', 'boot.json');
    writeBootRecord({ version: '1.0.0', at: '2026-11-10T12:00:00.000Z' }, file);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: '1.0.0' });
  });
});
