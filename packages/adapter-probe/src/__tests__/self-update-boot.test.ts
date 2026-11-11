import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootVerdict, readBootRecord, writeBootRecord } from '../self-update-boot.js';

const SINCE = '2026-11-10T12:00:00.000Z';
const LATER = '2026-11-10T12:05:00.000Z';
const EARLIER = '2026-11-10T11:55:00.000Z';

const record = (version: string, at: string) => ({ version, at });

function verdictOf(input: {
  readonly boot?: { version: string; at: string } | undefined;
  readonly up?: { version: string; at: string } | undefined;
  readonly now?: string;
}) {
  return bootVerdict({
    target: '1.2.3-beta.3',
    since: SINCE,
    boot: input.boot,
    up: input.up,
    now: input.now ?? LATER,
  });
}

describe('这一版到底起没起来：只认「确认可用」，不再自己翻回去', () => {
  it('★ 客户端确认过（目标版本、且在翻链之后）→ confirmed', () => {
    expect(verdictOf({ up: record('1.2.3-beta.3', LATER) })).toBe('confirmed');
  });

  it('★ 翻链之前那份确认不算数', () => {
    expect(verdictOf({ up: record('1.2.3-beta.3', EARLIER) })).toBe('no-boot');
  });

  it('★ 起来的是旧版也不判死：只报「还在等」（自更新不再自动回滚）', () => {
    expect(verdictOf({ boot: record('1.2.3-beta.2', LATER) })).toBe('waiting');
  });

  it('★ 新版起来但工作台那半没露面 → 一直等，多久都只是 waiting', () => {
    expect(verdictOf({ boot: record('1.2.3-beta.3', LATER), now: LATER })).toBe('waiting');
    expect(verdictOf({ boot: record('1.2.3-beta.3', LATER), now: '2026-11-10T18:00:00.000Z' })).toBe('waiting');
  });

  it('★ 还没重启过（没有新记录）→ no-boot', () => {
    expect(verdictOf({})).toBe('no-boot');
    expect(verdictOf({ boot: record('1.2.3-beta.2', EARLIER) })).toBe('no-boot');
  });

  it('记录读写：写进去读得出来；坏了 / 缺字段一律当没有', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-boot-'));
    const file = join(dir, 'self-update-boot.json');
    writeBootRecord({ version: '1.2.3-beta.3', at: LATER, pid: 42 }, file);
    expect(readBootRecord(file)).toEqual({ version: '1.2.3-beta.3', at: LATER, pid: 42 });
    expect(readBootRecord(join(dir, '没有这个文件.json'))).toBeUndefined();
    writeFileSync(file, '{ 不是 JSON');
    expect(readBootRecord(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ version: '1.2.3-beta.3' }));
    expect(readBootRecord(file)).toBeUndefined();
  });
});
