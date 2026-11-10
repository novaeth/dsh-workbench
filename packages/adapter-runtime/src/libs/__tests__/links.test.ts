import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureLibsBinOnPath, ensureLibsOpencliPeer } from '../links.js';

const LINK_TYPE = 'junction';

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
    expect(realpathSync(link).replaceAll('\\', '/')).toContain('toolchain/node_modules/@jackwener/opencli');
    expect(ensureLibsOpencliPeer()).toBe(false);
  });

  it('运行时还没装 opencli → 不建空链接（等它装好再说）', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-peer-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);

    expect(ensureLibsOpencliPeer()).toBe(false);
    expect(existsSync(join(root, 'opencli/libs/node_modules/@jackwener/opencli'))).toBe(false);
  });

  it('★ 断掉的链接（旧安装留下的）→ 重指到现在的运行时那份', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-peer-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    const link = join(root, 'opencli/libs/node_modules/@jackwener/opencli');
    mkdirSync(dirname(link), { recursive: true });
    mkdirSync(join(root, 'opencli/toolchain/node_modules/@jackwener/opencli'), { recursive: true });
    symlinkSync(join(root, 'gone-opencli'), link, LINK_TYPE);

    expect(ensureLibsOpencliPeer()).toBe(true);
    expect(realpathSync(link).replaceAll('\\', '/')).toContain('toolchain/node_modules/@jackwener/opencli');
  });

  it('★ 指向别处的链接 → 改指到运行时那份', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-peer-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    const link = join(root, 'opencli/libs/node_modules/@jackwener/opencli');
    mkdirSync(dirname(link), { recursive: true });
    mkdirSync(join(root, 'opencli/toolchain/node_modules/@jackwener/opencli'), { recursive: true });
    const other = join(root, 'other-opencli');
    mkdirSync(other, { recursive: true });
    symlinkSync(other, link, LINK_TYPE);

    expect(ensureLibsOpencliPeer()).toBe(true);
    expect(realpathSync(link).replaceAll('\\', '/')).toContain('toolchain/node_modules/@jackwener/opencli');
  });
});

describe('ensureLibsBinOnPath', () => {
  it('★ 把 bin 目录前插一次；再插不会重复（PATH 不许越跑越长）', () => {
    const env = { PATH: `/usr/bin${delimiter}/bin` };
    const expected = join('opencli', 'libs', 'node_modules', '.bin');
    expect(ensureLibsBinOnPath(env)).toBe(true);
    expect(env.PATH.split(delimiter)[0].endsWith(expected)).toBe(true);
    expect(ensureLibsBinOnPath(env)).toBe(false);
    expect(env.PATH.split(delimiter).filter((one) => one.endsWith(expected))).toHaveLength(1);
  });
});
