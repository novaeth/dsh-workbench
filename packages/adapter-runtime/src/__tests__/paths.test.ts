import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isolatedRoot, libsBinDir, npmCacheDir, toolchainOpencliDir, vendorPluginsDir } from '../foundation/paths.js';

describe('隔离运行时的路径（opencli 那套布局）', () => {
  it('★ 默认集合的根还是 <workbench>/opencli（老 profile 的插件、工具链、缓存都还找得到）', () => {
    expect(isolatedRoot().endsWith(join('workbench', 'opencli'))).toBe(true);
  });

  it('共用依赖的 bin 目录就在 libs 下面，插件在 plugins-npm 下面', () => {
    expect(libsBinDir().endsWith(join('opencli', 'libs', 'node_modules', '.bin'))).toBe(true);
    expect(npmCacheDir().endsWith(join('opencli', 'npm-cache'))).toBe(true);
    expect(vendorPluginsDir().endsWith(join('opencli', 'plugins-npm', 'node_modules'))).toBe(true);
    expect(toolchainOpencliDir().endsWith(join('opencli', 'toolchain', 'node_modules', '@jackwener', 'opencli'))).toBe(true);
  });
});
