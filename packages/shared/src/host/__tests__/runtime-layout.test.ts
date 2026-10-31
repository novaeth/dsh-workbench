import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runtimeLayoutOf, runtimeRootOf } from '../paths.js';

describe('运行时根的算法（这里不认识任何具体运行时）', () => {
  it('就是 workbench 根加一个 id，别处自己拼下面的布局', () => {
    const layout = runtimeLayoutOf('demo-runtime');

    expect(layout.root).toBe(runtimeRootOf('demo-runtime'));
    expect(layout.root.endsWith(join('workbench', 'demo-runtime'))).toBe(true);
    expect(layout.vendorPluginsDir).toBe(join(layout.root, 'plugins-npm', 'node_modules'));
    expect(layout.libsPrefix).toBe(join(layout.root, 'libs'));
    expect(layout.npmCacheDir).toBe(join(layout.root, 'npm-cache'));
  });
});
