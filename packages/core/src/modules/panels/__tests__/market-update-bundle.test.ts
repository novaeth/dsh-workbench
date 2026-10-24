import { describe, expect, it } from 'vitest';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule } from '@dsh-workbench/shared/host';
import type { ReplaceBundleDeps } from '../model/market-route';
import { updateModuleBundle } from '../model/market-update-bundle';

const PKG = '@a/mod';
const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'applied',
  stage: 'install',
  changed: true,
  target: PKG,
  ...over,
});

function depsOf(input: {
  readonly installed: () => InstalledModule;
  readonly install: BundleManager['install'];
  readonly modules?: () => readonly ProfileModule[];
}) {
  const manager: BundleManager = {
    registries: async () => null,
    inspect: async () => null,
    install: input.install,
    remove: async () => change({ stage: 'remove' }),
    cancel: async () => 'not-running',
  };
  const routeDeps: ReplaceBundleDeps = {
    manager,
    command: 'opencli',
    runAll: async () => undefined,
    rememberSource: async () => undefined,
    supplyAfter: async () => ({ state: 'no-needs' }),
    remove: async () => change({ stage: 'remove' }),
  };
  return {
    modules: input.modules ?? (() => [{ pkg: PKG, unit: 'mod', version: '0.1.0' }]),
    installed: input.installed,
    shell: undefined,
    manager,
    routeDeps,
    sweep: async () => undefined,
    refreshSupply: async () => undefined,
  };
}

describe('模块更新那一跳：跑完重新读盘对账', () => {
  it('★ 版本真动了 → applied + 盘上那一版', async () => {
    let version = '0.1.0';
    const outcome = await updateModuleBundle(
      'mod',
      depsOf({
        installed: () => ({ kind: 'module', pkg: PKG, unit: 'mod', version }),
        install: async () => {
          version = '0.1.1';
          return change();
        },
      }),
    );

    expect(outcome?.change.application).toBe('applied');
    expect(outcome?.change.version).toBe('0.1.1');
    expect(outcome?.module).toMatchObject({ kind: 'module', version: '0.1.1' });
  });

  it('★ 版本没动 → failed + no-change（界面不许再回「更新」按钮）', async () => {
    const outcome = await updateModuleBundle(
      'mod',
      depsOf({
        installed: () => ({ kind: 'module', pkg: PKG, unit: 'mod', version: '0.1.0' }),
        install: async () => change(),
      }),
    );

    expect(outcome?.change.application).toBe('failed');
    expect(outcome?.change.errorCode).toBe('no-change');
  });

  it('本地那份不给升；不在花名册里回 null', async () => {
    await expect(
      updateModuleBundle(
        'mod',
        depsOf({
          installed: () => ({ kind: 'module', pkg: PKG, unit: 'mod', version: '0.1.0' }),
          install: async () => change(),
          modules: () => [{ pkg: PKG, unit: 'mod', version: '0.1.0', local: true }],
        }),
      ),
    ).rejects.toThrow(/本地/);

    await expect(
      updateModuleBundle(
        'nope',
        depsOf({
          installed: () => ({ kind: 'unknown', pkg: PKG }),
          install: async () => change(),
        }),
      ),
    ).resolves.toBeNull();
  });
});
