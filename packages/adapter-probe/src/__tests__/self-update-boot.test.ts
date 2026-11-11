import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootRollsBack, bootVerdict, readBootRecord, writeBootRecord } from '../self-update-boot.js';
import { SELF_UPDATE_BOOT_GRACE_MS, SELF_UPDATE_BOOT_WINDOW_MS } from '../self-update-steps.js';

const SINCE = '2026-11-10T12:00:00.000Z';
const LATER = '2026-11-10T12:05:00.000Z';
const EARLIER = '2026-11-10T11:55:00.000Z';

const record = (version: string, at: string) => ({ version, at });

function verdictOf(input: {
  readonly boot?: { version: string; at: string } | undefined;
  readonly up?: { version: string; at: string } | undefined;
  readonly now?: string;
  readonly graceMs?: number;
}) {
  return bootVerdict({
    target: '1.2.3-beta.3',
    since: SINCE,
    boot: input.boot,
    up: input.up,
    now: input.now ?? LATER,
    graceMs: input.graceMs ?? SELF_UPDATE_BOOT_GRACE_MS,
  });
}

describe('自动回退窗口：这一版到底起没起来', () => {
  it('★ 客户端确认过（目标版本、且在翻链之后）→ confirmed：不回头', () => {
    expect(verdictOf({ up: record('1.2.3-beta.3', LATER) })).toBe('confirmed');
    expect(bootRollsBack('confirmed')).toBe(false);
  });

  it('★ 翻链之前那份确认不算数，版本对不上也不算', () => {
    expect(verdictOf({ up: record('1.2.3-beta.3', EARLIER) })).toBe('no-boot');
    expect(verdictOf({ up: record('1.2.3-beta.2', LATER), boot: record('1.2.3-beta.2', LATER) })).toBe('wrong-version');
  });

  it('★ 重启起来的是旧版 → wrong-version：新那半没换上，回头', () => {
    expect(verdictOf({ boot: record('1.2.3-beta.2', LATER) })).toBe('wrong-version');
    expect(bootRollsBack('wrong-version')).toBe(true);
  });

  it('★ 新版起来了但工作台那半一直没露面 → 宽限期内等着，过了就是 half-down（回头）', () => {
    expect(verdictOf({ boot: record('1.2.3-beta.3', LATER), now: LATER })).toBe('waiting');
    expect(verdictOf({ boot: record('1.2.3-beta.3', LATER), now: '2026-11-10T12:16:00.000Z' })).toBe('half-down');
    expect(bootRollsBack('half-down')).toBe(true);
  });

  it('★ 宽限期是 10 分钟：重启后没马上看工作台那几分钟不算坏（免得把好版本翻回去）', () => {
    const boot = record('1.2.3-beta.3', LATER);

    expect(SELF_UPDATE_BOOT_GRACE_MS).toBe(600_000);
    expect(SELF_UPDATE_BOOT_WINDOW_MS).toBeGreaterThan(SELF_UPDATE_BOOT_GRACE_MS);
    expect(verdictOf({ boot, now: '2026-11-10T12:08:00.000Z' })).toBe('waiting');
    expect(verdictOf({ boot, now: '2026-11-10T12:14:00.000Z' })).toBe('waiting');
    expect(verdictOf({ boot, now: '2026-11-10T12:16:00.000Z' })).toBe('half-down');
  });

  it('★ 还没重启过（没有新记录）→ no-boot：不判失败、也不回头', () => {
    expect(verdictOf({})).toBe('no-boot');
    expect(verdictOf({ boot: record('1.2.3-beta.2', EARLIER) })).toBe('no-boot');
    expect(bootRollsBack('no-boot')).toBe(false);
    expect(bootRollsBack('waiting')).toBe(false);
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
