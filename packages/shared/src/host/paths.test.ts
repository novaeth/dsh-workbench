import { delimiter } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureLibsBinOnPath, libsBinDir, npmCacheDir } from './paths.js';

describe('隔离运行时的路径', () => {
  it('共用依赖的 bin 目录就在 libs 下面', () => {
    expect(libsBinDir().endsWith('/opencli/libs/node_modules/.bin')).toBe(true);
    expect(npmCacheDir().endsWith('/opencli/npm-cache')).toBe(true);
  });

  it('★ 把 bin 目录前插一次；再插不会重复（PATH 不许越跑越长）', () => {
    const env = { PATH: `/usr/bin${delimiter}/bin` };
    const dir = libsBinDir();

    expect(ensureLibsBinOnPath(env)).toBe(true);
    expect(env.PATH).toBe(`${dir}${delimiter}/usr/bin${delimiter}/bin`);
    expect(ensureLibsBinOnPath(env)).toBe(false);
    expect(env.PATH.split(delimiter).filter((one) => one === dir)).toHaveLength(1);
  });

  it('PATH 是空的也能插', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(ensureLibsBinOnPath(env)).toBe(true);
    expect(env.PATH).toBe(libsBinDir());
  });
});
