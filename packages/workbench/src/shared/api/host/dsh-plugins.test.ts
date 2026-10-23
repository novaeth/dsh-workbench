import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { DSH_PLUGINS_ROUTE } from '../dsh-plugins.js';
import { dshPluginsHandler, readDshPlugins } from './dsh-plugins';

function fakeContext(manager: unknown): DshHostContext {
  return { get: (name: string) => (name === 'pluginManager' ? manager : undefined) } as unknown as DshHostContext;
}

describe('dsh 插件真相（只读）', () => {
  it('走标准路由表，路由名与契约里的一致', () => {
    expect(DSH_PLUGINS_ROUTE).toBe('dsh-plugins');
  });

  it('没有插件管理器时明确说不可用，而不是抛', async () => {
    expect(await readDshPlugins(fakeContext(undefined))).toEqual({ available: false, bundles: [], plugins: [] });
  });

  it('把 bundle 行归一成 name / version / enabled，容忍 id 与 disabled:true，丢掉没有名字的', async () => {
    const ctx = fakeContext({
      listBundles: async () => [
        { name: '@dsh-workbench/core', version: '0.1.2', enabled: true },
        { id: '@dsh-workbench/module-hello', version: '0.1.2', disabled: true },
        { version: '0.1.2' },
        'nonsense',
      ],
      listPlugins: async () => ({ rows: [{ name: 'workbench', disabled: false }] }),
    });
    const snapshot = await readDshPlugins(ctx);
    expect(snapshot.available).toBe(true);
    expect(snapshot.bundles).toEqual([
      { name: '@dsh-workbench/core', version: '0.1.2', enabled: true },
      { name: '@dsh-workbench/module-hello', version: '0.1.2', enabled: false },
    ]);
    expect(snapshot.plugins).toEqual([{ name: 'workbench', version: '', enabled: true }]);
  });

  it('处理器就是这条快照（shared 的 registerApi 负责取参数与回 JSON）', async () => {
    const ctx = fakeContext({ listBundles: async () => [{ name: 'x', version: '1.0.0' }], listPlugins: async () => [] });
    expect(await dshPluginsHandler(ctx)(new URLSearchParams())).toEqual({
      available: true,
      bundles: [{ name: 'x', version: '1.0.0', enabled: true }],
      plugins: [],
    });
  });
});
