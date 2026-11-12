import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settlePendingSelfUpdate } from '../self-update-settle';

const roots: string[] = [];
const homes: string[] = [];

function markerHome(marker: unknown): string {
  const home = mkdtempSync(join(tmpdir(), 'wb-settle-'));
  roots.push(home);
  homes.push(home);
  mkdirSync(join(home, 'workbench'), { recursive: true });
  writeFileSync(join(home, 'workbench', 'self-update.json'), `${JSON.stringify(marker)}\n`);
  vi.stubEnv('DSH_HOME', home);
  vi.stubEnv('DSH_WORKBENCH_HOME', join(home, 'workbench'));
  return join(home, 'workbench', 'self-update.json');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('宿主起来时把「等重启」的 marker 收尾', () => {
  it('★ 跑的版本就是 marker 说的新版 → 落 ok（不用等客户端那半确认）', () => {
    const file = markerHome({ state: 'pending-restart', version: '1.2.3', from: '1.2.3-beta.7' });

    expect(settlePendingSelfUpdate('1.2.3')).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ state: 'ok', version: '1.2.3' });
  });

  it('★ 版本对不上 / 不是等重启 / 读不到 marker → 一律不动', () => {
    const other = markerHome({ state: 'pending-restart', version: '1.2.3' });
    expect(settlePendingSelfUpdate('1.2.3-beta.7')).toBe(false);
    expect(JSON.parse(readFileSync(other, 'utf8'))).toMatchObject({ state: 'pending-restart' });

    const failed = markerHome({ state: 'failed', version: '1.2.3' });
    expect(settlePendingSelfUpdate('1.2.3')).toBe(false);
    expect(JSON.parse(readFileSync(failed, 'utf8'))).toMatchObject({ state: 'failed' });

    expect(settlePendingSelfUpdate(undefined)).toBe(false);
  });
});
