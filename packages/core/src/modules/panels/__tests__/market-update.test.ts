import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import { createMarketService } from '../model/market';

const plainUnit: UnitManifest = {
  id: 'hello',
  titleKey: 'hello.mine', card: { order: 10 },
  tools: [],
  host: { inject: [] },
};

const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'applied',
  stage: 'install',
  changed: true,
  target: '@dsh-workbench/module-issues',
  bundle: '@dsh-workbench/module-issues',
  ...over,
});

function bundlesOf(over: Partial<BundleManager> = {}): BundleManager {
  return {
    registries: async () => null,
    inspect: async () => null,
    install: async () => change(),
    remove: async () => change({ stage: 'remove' }),
    cancel: async () => 'cancelled',
    ...over,
  };
}

const isModule = (unitId: string): InstalledModule => ({
  kind: 'module',
  pkg: '@dsh-workbench/module-issues',
  unit: unitId,
  version: '0.1.0',
});

const roster = (extra: { local?: boolean } = {}) => [
  { pkg: '@dsh-workbench/module-issues', unit: 'issues', version: '0.1.0', ...extra },
];

describe('升模块包（行上的「更新」）：有包就升包，没包就交回老的供给升级', () => {
  it('★ 出过包的模块 → 拿包名装最新版（不带版本号 = 让源决定最新）', async () => {
    const asked: string[] = [];
    let version = '0.1.0';
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async (request) => {
          asked.push(request.spec);
          version = '0.1.1';
          return change({ bundle: request.spec });
        },
      }),
      installed: () => ({ ...isModule('issues'), version }),
      modules: () => roster(),
    });

    const outcome = await market.updateBundle('issues');

    expect(asked).toEqual(['@dsh-workbench/module-issues']);
    expect(outcome?.change.stage).toBe('install');
    expect(outcome?.change.application).toBe('applied');
    expect(outcome?.module).toMatchObject({ kind: 'module', version: '0.1.1' });
  });

  it('★ dsh 开着热更新时同一个包不许就地覆盖（already-installed）→ 先卸再装', async () => {
    const did: string[] = [];
    let present = true;
    let version = '0.1.0';
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async (request) => {
          did.push(`install ${request.spec}`);
          if (present) return change({ application: 'failed', changed: false, errorCode: 'already-installed' });
          present = true;
          version = '0.1.1';
          return change({ bundle: request.spec });
        },
        remove: async (name) => {
          did.push(`remove ${name}`);
          present = false;
          return change({ stage: 'remove' });
        },
      }),
      installed: () =>
        present
          ? { ...isModule('issues'), version }
          : { kind: 'unknown', pkg: '@dsh-workbench/module-issues' },
      modules: () => roster(),
    });

    const outcome = await market.updateBundle('issues');

    expect(did).toEqual([
      'install @dsh-workbench/module-issues',
      'remove @dsh-workbench/module-issues',
      'install @dsh-workbench/module-issues',
    ]);
    expect(outcome?.change.application).toBe('applied');
    expect(outcome?.module).toMatchObject({ kind: 'module', version: '0.1.1' });
  });

  it('★ 跑完版本没动 → 不许回 applied，照实给 no-change（界面拿它说「更新失败」）', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async (request) => change({ bundle: request.spec }),
      }),
      installed: () => isModule('issues'),
      modules: () => roster(),
    });

    const outcome = await market.updateBundle('issues');

    expect(outcome?.change.application).toBe('failed');
    expect(outcome?.change.errorCode).toBe('no-change');
    expect(outcome?.change.errorDetail).toContain('0.1.0');
  });

  it('★ 新版没装成、盘上还读不到它了 → 把旧版装回去，别让一次更新把模块弄丢', async () => {
    const asked: string[] = [];
    let present = true;
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async (request) => {
          asked.push(request.spec);
          if (request.spec.endsWith('@0.1.0')) {
            present = true;
            return change({ bundle: '@dsh-workbench/module-issues' });
          }
          if (present) return change({ application: 'failed', changed: false, errorCode: 'already-installed' });
          return change({ application: 'failed', changed: false, errorCode: 'network' });
        },
        remove: async () => {
          present = false;
          return change({ stage: 'remove' });
        },
      }),
      installed: () =>
        present
          ? isModule('issues')
          : { kind: 'unknown', pkg: '@dsh-workbench/module-issues' },
      modules: () => roster(),
    });

    const outcome = await market.updateBundle('issues');

    expect(asked.at(-1)).toBe('@dsh-workbench/module-issues@0.1.0');
    expect(outcome?.restored).toBe('0.1.0');
    expect(outcome?.module).toMatchObject({ kind: 'module', version: '0.1.0' });
    expect(outcome?.change.application).toBe('failed');
  });

  it('★ 旧版卸不掉 → 不硬装第二遍，照实把卸载那一步的失败交出去', async () => {
    const did: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async () => {
          did.push('install');
          return change({ application: 'failed', changed: false, errorCode: 'already-installed' });
        },
        remove: async () => {
          did.push('remove');
          return change({ stage: 'remove', application: 'failed', errorCode: 'not-removable' });
        },
      }),
      installed: () => isModule('issues'),
      modules: () => roster(),
    });

    const outcome = await market.updateBundle('issues');

    expect(did).toEqual(['install', 'remove']);
    expect(outcome?.change).toMatchObject({ stage: 'remove', errorCode: 'not-removable' });
  });

  it('★ 装得进去（这份 profile 没开热更新）→ 一条卸载都不发', async () => {
    const did: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async (request) => {
          did.push(`install ${request.spec}`);
          return change({ bundle: request.spec });
        },
        remove: async (name) => {
          did.push(`remove ${name}`);
          return change({ stage: 'remove' });
        },
      }),
      installed: () => isModule('issues'),
      modules: () => roster(),
    });

    await market.updateBundle('issues');

    expect(did).toEqual(['install @dsh-workbench/module-issues']);
  });

  it('★ 装了本地那一份（link:）的模块不给升：升它就等于把 link 换成源上那份', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async () => {
          throw new Error('本地那份不该去碰管理器');
        },
      }),
      modules: () => roster({ local: true }),
    });

    await expect(market.updateBundle('issues')).rejects.toThrow(/本地/);
  });

  it('★ 模块自己声明了源 → 带上那个源 + 查到的版本（不带源就会去默认源找内网包，必然找不到）', async () => {
    const asked: { spec: string; registry?: string | null }[] = [];
    const fake = createFakeShell([{ stdout: '0.1.3' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [],
      bundles: bundlesOf({
        install: async (request) => {
          asked.push({ spec: request.spec, registry: request.registry });
          return change({ bundle: '@dsh-workbench/module-issues' });
        },
      }),
      installed: () => ({
        kind: 'module',
        pkg: '@dsh-workbench/module-issues',
        unit: 'issues',
        version: '0.1.2',
        registry: 'https://npm.example.test/team/npm',
      }),
      modules: () => roster(),
      shell: fake.shell,
    });

    const outcome = await market.updateBundle('issues');

    expect(asked).toEqual([
      { spec: '@dsh-workbench/module-issues@0.1.3', registry: 'https://npm.example.test/team/npm' },
    ]);
    expect(fake.commands()[0]).toContain('https://npm.example.test/team/npm');
    expect(outcome?.change.stage).toBe('install');
  });

  it('★ 升模块也把它的供给一起升（供给有新版不该留在那儿）', async () => {
    const fake = createFakeShell([{ stdout: '0.1.3' }, { stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [
        {
          ...plainUnit,
          id: 'issues',
          needs: [
            {
              kind: 'lib',
              name: 'opencli-workflow',
              version: '1.1.24',
              purpose: '跑工作流',
              sources: [
                {
                  kind: 'npm',
                  registryEnv: 'WB_TEST_REGISTRY',
                  registryDefault: 'https://registry.example.test/',
                },
              ],
            },
          ],
        },
      ],
      probe: async () => ({
        unit: 'issues',
        status: 'ok',
        needs: [
          {
            id: 'lib:opencli-workflow',
            kind: 'lib',
            name: 'opencli-workflow',
            status: 'outdated',
            detail: '跑工作流',
            installed: '1.1.24',
            latest: '1.1.30',
          },
        ],
        detail: '假探测',
      }),
      shell: fake.shell,
      bundles: bundlesOf({ install: async () => change() }),
      installed: () => ({
        kind: 'module',
        pkg: '@dsh-workbench/module-issues',
        unit: 'issues',
        version: '0.1.2',
      }),
      modules: () => roster(),
    });

    await market.updateBundle('issues');

    expect(fake.commands().some((line) => line.includes('opencli-workflow'))).toBe(true);
  });

  it('没出包的老模块 → 交回 null（由分发走老路：升它的 opencli 供给）', async () => {
    const market = createMarketService({ command: 'opencli', manifests: [], bundles: bundlesOf(), modules: () => [] });
    expect(await market.updateBundle('issues')).toBeNull();
  });

  it('连模块花名册都没有 → 也是 null（不是抛）', async () => {
    const market = createMarketService({ command: 'opencli', manifests: [], bundles: bundlesOf() });
    expect(await market.updateBundle('issues')).toBeNull();
  });
});
