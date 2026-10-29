import { describe, expect, it } from 'vitest';
import { libsBinDir, npmCacheDir } from '../paths.js';

describe('隔离运行时的路径', () => {
  it('共用依赖的 bin 目录就在 libs 下面', () => {
    expect(libsBinDir().endsWith('/opencli/libs/node_modules/.bin')).toBe(true);
    expect(npmCacheDir().endsWith('/opencli/npm-cache')).toBe(true);
  });
});
