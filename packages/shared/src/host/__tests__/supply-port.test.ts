import { describe, expect, it } from 'vitest';
import { supplyPortOf } from '../supply-port.js';
import { WORKBENCH_ADAPTERS } from '../adapters.js';
import { fakeAdapterSet } from '../../testing/fake-adapter-set.js';

function ctxOf(set: ReturnType<typeof fakeAdapterSet>): never {
  return { get: (name: string) => (name === WORKBENCH_ADAPTERS ? set : undefined) } as never;
}

describe('组合出给外壳的 supply 端口', () => {
  it('给了 CLI 目录就透传（opencli 那类运行时）', () => {
    const port = supplyPortOf(ctxOf(fakeAdapterSet()));

    expect(port.cliCatalogPath?.()).toBe('/tmp/dsh-workbench-fake/catalog.json');
    expect(port.vendorPluginsDir?.()).toContain('dsh-workbench-fake');
    expect(port.runtimeInstallCommand?.()).toBeTruthy();
  });

  it('★ 没给就整条不挂（纯 API 的运行时不用瞎编目录）', () => {
    const set = fakeAdapterSet();
    const modules = { ...set.modules } as Record<string, unknown>;
    delete modules['cliCatalogPath'];
    delete modules['vendorPluginsDir'];
    delete modules['runtimeInstallCommand'];
    const port = supplyPortOf(ctxOf({ ...set, modules } as never));

    expect(port.cliCatalogPath).toBeUndefined();
    expect(port.vendorPluginsDir).toBeUndefined();
    expect(port.runtimeInstallCommand).toBeUndefined();
    expect(port.isolatedRoot()).toBeTruthy();
  });
});
