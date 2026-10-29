import { describe, expect, it } from 'vitest';
import { runtimeLayoutOf, runtimeRootOf } from '../paths.js';

describe('运行时根的算法（这里不认识任何具体运行时）', () => {
  it('就是 workbench 根加一个 id，别处自己拼下面的布局', () => {
    const layout = runtimeLayoutOf('demo-runtime');

    expect(layout.root).toBe(runtimeRootOf('demo-runtime'));
    expect(layout.root.endsWith('/workbench/demo-runtime')).toBe(true);
    expect(layout.vendorPluginsDir).toBe(`${layout.root}/plugins-npm/node_modules`);
    expect(layout.libsPrefix).toBe(`${layout.root}/libs`);
    expect(layout.npmCacheDir).toBe(`${layout.root}/npm-cache`);
  });
});
