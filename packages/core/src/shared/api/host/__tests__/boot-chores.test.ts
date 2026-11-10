import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootChores } from '../boot-chores';

const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-boot-chores-'));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('启动这一拍：先落 boot 记录，再接着排没跑完的更新', () => {
  it('★ 报出自己这一版，并把 boot 记录落进工作台那本目录', () => {
    vi.stubEnv('DSH_WORKBENCH_HOME', join(dir, 'workbench'));
    const version = bootChores({
      ctx: {} as never,
      supply: undefined,
      home: dir,
      profileDir: null,
      version: '1.2.3-beta.3',
    });

    expect(version).toBe('1.2.3-beta.3');
    expect(JSON.parse(readFileSync(join(dir, 'workbench', 'self-update-boot.json'), 'utf8'))).toMatchObject({
      version: '1.2.3-beta.3',
      pid: process.pid,
    });
  });

  it('★ 问不到版本（跑在源码上那种）→ 不写记录、也不抛', () => {
    vi.stubEnv('DSH_WORKBENCH_HOME', join(dir, 'nowhere'));
    expect(bootChores({ ctx: {} as never, supply: undefined, home: dir, profileDir: null })).toBeUndefined();
  });
});
