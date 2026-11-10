import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdHostLock } from '../host-lock';

describe('宿主锁：在跑就留一枚，退出就摘掉', () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const fresh = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'wb-host-lock-'));
    roots.push(root);
    vi.stubEnv('DSH_HOME', root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    return root;
  };

  it('★ 起来写一枚锁（带 pid），退出删掉 —— 自更新靠它判"宿主还在不在"', () => {
    const root = fresh();
    const problems: string[] = [];
    const lock = join(root, 'workbench', 'host.lock');

    const release = holdHostLock((message) => problems.push(message));

    expect(existsSync(lock)).toBe(true);
    expect(JSON.parse(readFileSync(lock, 'utf8'))).toMatchObject({ pid: process.pid });
    expect(problems).toEqual([]);

    release();
    expect(existsSync(lock)).toBe(false);
    expect(problems).toEqual([]);
  });

  it('★ 锁写不上只报一句、不抛 —— 少一道闸不该把宿主带崩', () => {
    const root = fresh();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'workbench'), 'not-a-dir');
    const problems: string[] = [];

    const release = holdHostLock((message) => problems.push(message));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('宿主锁没写上');
    expect(() => release()).not.toThrow();
  });

  it('★ 锁已经被人删了再退出也不抛（force 删）', () => {
    const root = fresh();
    const problems: string[] = [];

    const release = holdHostLock((message) => problems.push(message));
    rmSync(join(root, 'workbench', 'host.lock'), { force: true });

    expect(() => release()).not.toThrow();
    expect(problems).toEqual([]);
  });
});
