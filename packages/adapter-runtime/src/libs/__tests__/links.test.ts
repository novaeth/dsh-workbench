import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureLibsBinOnPath, ensureLibsOpencliPeer } from '../links.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ensureLibsOpencliPeer', () => {
  it('★ 运行时那份 opencli 在 → 链到 libs，libs 里的命令才 import 得到它', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-peer-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    mkdirSync(join(root, 'opencli/toolchain/node_modules/@jackwener/opencli'), { recursive: true });

    expect(ensureLibsOpencliPeer()).toBe(true);
    const link = join(root, 'opencli/libs/node_modules/@jackwener/opencli');
    expect(existsSync(link)).toBe(true);
    expect(realpathSync(link)).toContain('toolchain/node_modules/@jackwener/opencli');
    expect(ensureLibsOpencliPeer()).toBe(false);
  });

  it('运行时还没装 opencli → 不建空链接（等它装好再说）', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-peer-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);

    expect(ensureLibsOpencliPeer()).toBe(false);
    expect(existsSync(join(root, 'opencli/libs/node_modules/@jackwener/opencli'))).toBe(false);
  });
});

describe('ensureLibsBinOnPath', () => {
  it('★ 把 bin 目录前插一次；再插不会重复（PATH 不许越跑越长）', () => {
    const env = { PATH: `/usr/bin${delimiter}/bin` };
    expect(ensureLibsBinOnPath(env)).toBe(true);
    expect(env.PATH.split(delimiter)[0].endsWith('/opencli/libs/node_modules/.bin')).toBe(true);
    expect(ensureLibsBinOnPath(env)).toBe(false);
    expect(env.PATH.split(delimiter).filter((one) => one.endsWith('/opencli/libs/node_modules/.bin'))).toHaveLength(1);
  });
});
