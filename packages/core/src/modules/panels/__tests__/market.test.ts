import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { unitTitleKey } from '@dsh-workbench/shared';
import type { SupplySource, UnitManifest } from '@dsh-workbench/shared';
import type { NeedState, UnitCapability } from '@dsh-workbench/shared/host';
import { createMarketService } from '../model/market';

const GIT: SupplySource = { kind: 'git', url: 'git@x:demo.git' };

function unit(id: string, plugin = 'demo', sources?: readonly SupplySource[]): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [
      {
        kind: 'extension',
        runtime: 'opencli',
        name: plugin,
        commands: ['x'],
        purpose: '测试',
        ...(sources === undefined ? {} : { sources }),
      },
    ],
  };
}

const uiUnit: UnitManifest = { id: 'panels', titleKey: unitTitleKey('panels'), card: null, tools: [], host: { inject: [] } };

const missingState = (name = 'demo', extra: Partial<NeedState> = {}): NeedState => ({
  id: `extension:${name}`,
  kind: 'extension',
  name,
  status: 'missing',
  detail: '假探测',
  provision: 'ready',
  command: "'opencli' plugin install 'git@x:demo.git'",
  ...extra,
});

const outdatedState = (name = 'demo', extra: Partial<NeedState> = {}): NeedState => ({
  id: `extension:${name}`,
  kind: 'extension',
  name,
  status: 'outdated',
  detail: '假探测：缺命令',
  command: "'opencli' plugin update 'demo'",
  ...extra,
});

const okState = (name = 'demo'): NeedState => ({
  id: `extension:${name}`,
  kind: 'extension',
  name,
  status: 'ok',
  detail: '假探测',
});

function probeWith(table: Readonly<Record<string, UnitCapability>>) {
  return vi.fn(
    async (id: string): Promise<UnitCapability> =>
      table[id] ?? { unit: id, status: 'ok', needs: [okState()] },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createMarketService：目录', () => {
  it('★ 目录不看"有没有依赖要装"：没有 needs 的模块也在目录里', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo', [GIT]), uiUnit],
      probe: probeWith({ issues: { unit: 'issues', status: 'ok', needs: [okState()] } }),
    });

    const entries = (await market.list()).modules;

    expect(entries.map((entry) => entry.unit)).toEqual(['issues', 'panels']);
    expect(entries[0]?.needs.map((need) => need.name)).toEqual(['demo']);
    expect(entries[0]?.capability.status).toBe('ok');
    expect(entries[1]?.needs).toEqual([]);
  });

  it('★ 共用依赖按 need 聚合：两个模块声明同一份 → 一行，usedBy 是那两个', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo', [GIT]), unit('builds', 'demo', [GIT])],
      probe: probeWith({}),
    });

    const { shared } = await market.list();

    expect(shared.map((item) => item.id)).toEqual(['extension:demo']);
    expect(shared[0]?.usedBy).toEqual(['issues', 'builds']);
  });
});

describe('createMarketService：install', () => {
  it('★ 装之前**强探** —— 幂等判断不许拿缓存的旧结论', async () => {
    const probe = probeWith({ issues: { unit: 'issues', status: 'missing', needs: [missingState()] } });
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({ command: 'opencli', manifests: [unit('issues')], probe, shell: fake.shell });

    await market.install('issues');

    expect(probe).toHaveBeenCalledWith('issues', { force: true });
  });

  it('跑探测给出的那条安装命令，并通知装配方', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'missing', needs: [missingState()] } }),
      shell: fake.shell,
      onInstalled,
    });

    await market.install('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin install 'git@x:demo.git'"]);
    expect(onInstalled).toHaveBeenCalledWith('issues');
  });

  it('本来就能用（幂等早返回）也要通知 —— 用户按的是"安装"，但一条命令都不跑', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'ok', needs: [okState()] } }),
      shell: fake.shell,
      onInstalled,
    });

    await market.install('issues');

    expect(fake.commands()).toEqual([]);
    expect(onInstalled).toHaveBeenCalledWith('issues');
  });

  it('★ 来源解析不出（env-missing）→ 抛，且**一条命令都不跑**', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo', [{ kind: 'local', env: 'DSH_WORKBENCH_TEST_UNSET' }])],
      probe: probeWith({
        issues: {
          unit: 'issues',
          status: 'missing',
          needs: [missingState('demo', { provision: 'env-missing' })],
        },
      }),
      shell: fake.shell,
    });

    await expect(market.install('issues')).rejects.toThrow(/DSH_WORKBENCH_TEST_UNSET/);
    expect(fake.commands()).toEqual([]);
  });
});

describe('createMarketService：update', () => {
  it('只跑 need 给的更新命令；更新不触发"默认上板"', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    let first = true;
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async (id: string): Promise<UnitCapability> => {
        const status = first ? 'outdated' : 'ok';
        first = false;
        return {
          unit: id,
          status,
          needs: [status === 'outdated' ? outdatedState() : okState()],
        };
      },
      shell: fake.shell,
      onInstalled,
    });

    await market.update('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin update 'demo'"]);
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('★ 更新命令跑完还是旧的样子 → 抛出原因（不许静默）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'outdated', needs: [outdatedState()] } }),
      shell: fake.shell,
    });

    await expect(market.update('issues')).rejects.toThrow(/还是旧的样子/);
  });
});

describe('createMarketService：uninstall', () => {
  it('★ 还有别的模块要它 → 那份安装留着，同时把主张者说出来', async () => {
    const onUninstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues'), unit('builds')],
      probe: probeWith({}),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      onUninstalled,
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual([]);
    expect(keptFor).toEqual(['builds']);
    expect(onUninstalled).toHaveBeenCalledWith('issues');
  });

  it('独一份 → 真的卸掉', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({}),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
    expect(keptFor).toEqual([]);
  });

  it('★ 别的模块已经放手（released）→ 不算主张者，安装照卸', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues'), unit('builds')],
      probe: probeWith({}),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      isReleased: (id) => id === 'builds',
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
    expect(keptFor).toEqual([]);
  });

  it('★ 引用不可信 → 插件那侧一根手指都不碰，还说清为什么', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const logs: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({}),
      shell: fake.shell,
      references: () => ({ trustworthy: false, unreadable: ['@a/mod'] }),
      logger: { info: (message) => logs.push(message) },
    });

    await market.uninstall('issues');

    expect(fake.commands()).toEqual([]);
    expect(logs.join('\n')).toContain('文件先留着');
  });
});
