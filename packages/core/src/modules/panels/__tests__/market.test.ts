import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { PluginSource, UnitManifest } from '@dsh-workbench/shared';
import { createMarketService } from '../model/market';
import { createPluginLedger } from '../model/plugin-ledger';

function unit(id: string, plugin: string, source?: PluginSource): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    env: {
      command: 'opencli',
      plugins: [{ name: plugin, commands: ['x'], ...(source === undefined ? {} : { installSource: source }) }],
    },
  };
}

const uiUnit: UnitManifest = {
  id: 'panels',
  card: null,
  tools: [],
  host: { inject: [] },
};

const probeOf =
  (statuses: Readonly<Record<string, UnitCapability['status']>>, names: readonly string[] = ['demo']) =>
  async (id: string): Promise<UnitCapability> => {
    const status = statuses[id] ?? 'ok';
    const one = status === 'missing-plugin' ? 'missing' : status === 'missing-commands' ? 'outdated' : 'ok';
    return {
      unit: id,
      status,
      required: [],
      missing: [],
      detail: '假探测',
      plugins: names.map((name) => ({ name, status: one, missing: [] })),
    };
  };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createMarketService', () => {
  it('★ 目录不看"有没有插件要装"：没有 env 的模块也在目录里（供给那格是空的）', async () => {
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' }), uiUnit],
      probe: probeOf({ issues: 'ok' }),
    });

    const entries = (await market.list()).modules;

    expect(entries.map((entry) => entry.unit)).toEqual(['issues', 'panels']);
    expect(entries[0]?.plugins).toEqual([{ name: 'demo', source: { kind: 'git', url: 'git@x' } }]);
    expect(entries[0]?.capability.status).toBe('ok');
    expect(entries[1]?.plugins).toEqual([]);
  });

  it('★ 装之前**强探** —— 幂等判断不许拿缓存的旧结论（实测反例：插件被外部挪走后装了个寂寞）', async () => {
    const probe = vi.fn(
      async (id: string): Promise<UnitCapability> => ({
        unit: id,
        status: 'missing-plugin',
        required: [],
        missing: [],
        detail: '假探测',
      }),
    );
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' })],
      probe,
      shell: fake.shell,
    });

    await market.install('issues');

    expect(probe).toHaveBeenCalledWith('issues', { force: true });
  });

  it('★ 装好了通知装配方一声（"默认上板"那条规则在装配处，不在市场里）', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' })],
      probe: probeOf({ issues: 'missing-plugin' }),
      shell: fake.shell,
      onInstalled,
    });

    await market.install('issues');

    expect(onInstalled).toHaveBeenCalledWith('issues');
  });

  it('本来就能用（幂等早返回）也要通知 —— 用户按的是"安装"', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' })],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
      onInstalled,
    });

    await market.install('issues');

    expect(onInstalled).toHaveBeenCalledWith('issues');
    expect(fake.commands()).toEqual([]);
  });

  it('更新 / 卸载**不**通知（只有"装"才带上板这一步）', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }, { stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' })],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
      onInstalled,
    });

    await market.update('issues');
    await market.uninstall('issues');

    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('★ 有**版本信号**时更新走"原地重装隔离 prefix"，而不是 `plugin update`', async () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    vi.stubEnv('DSH_WB_TEST_REGISTRY', 'https://npm.example.com/team/repo');
    const manifest = unit('issues', 'demo', {
      kind: 'npm',
      package: 'opencli-plugin-demo',
      registryEnv: 'DSH_WB_TEST_REGISTRY',
    });
    const fake = createFakeShell([{ stdout: '' }, { stdout: '' }]);
    const market = createMarketService({
      manifests: [manifest],
      probe: async (id: string): Promise<UnitCapability> => ({
        unit: id,
        status: 'ok',
        required: [],
        missing: [],
        detail: '假探测',
        plugins: [
          {
            name: 'demo',
            status: 'outdated',
            missing: [],
            release: { installed: '1.0.39', latest: '1.0.40' },
          },
        ],
      }),
      shell: fake.shell,
    });

    await market.update('issues');

    const lines = fake.commands();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('npm i --prefix');
    expect(lines[0]).toContain("'opencli-plugin-demo@1.0.40'");
    expect(lines[0]).toContain('--registry');
    expect(lines[0]).not.toContain(' -g');
    expect(lines[1]).toContain('rm -rf');
    expect(lines[1]).toContain('ln -s');
    expect(lines.join(' ')).not.toContain('plugin update');
  });

  it('★ npm 来源：装按**顺序**跑完三步 + 兜底（第一步不是 `-g`）', async () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    vi.stubEnv('DSH_WB_TEST_REGISTRY', 'https://npm.example.com/team/repo');
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [
        unit('issues', 'demo', {
          kind: 'npm',
          package: 'opencli-plugin-demo',
          registryEnv: 'DSH_WB_TEST_REGISTRY',
        }),
      ],
      probe: probeOf({ issues: 'missing-plugin' }),
      shell: fake.shell,
    });

    await market.install('issues');

    const lines = fake.commands();
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain(`npm i --prefix '/tmp/dshhome/workbench/opencli/plugins-npm'`);
    expect(lines[1]).toContain('rm -rf');
    expect(lines[1]).toContain('ln -s');
    expect(lines[2]).toContain("plugin uninstall 'demo'");
    expect(lines[3]).toContain(`NPM_CONFIG_REGISTRY='https://npm.example.com/team/repo'`);
    expect(lines[3]).toContain('plugin install');
  });

  it('★ 兜底那条失败**不当失败**（本来就没装时它必然失败，不能把安装断在那儿）', async () => {
    vi.stubEnv('DSH_HOME', '/tmp/dshhome');
    vi.stubEnv('DSH_WB_TEST_REGISTRY', 'https://npm.example.com/team/repo');
    const fake = createFakeShell((call) =>
      call.command.includes('plugin uninstall') ? { exitCode: 1, stderr: 'no such plugin' } : { stdout: '' },
    );
    const market = createMarketService({
      manifests: [
        unit('issues', 'demo', {
          kind: 'npm',
          package: 'opencli-plugin-demo',
          registryEnv: 'DSH_WB_TEST_REGISTRY',
        }),
      ],
      probe: probeOf({ issues: 'missing-plugin' }),
      shell: fake.shell,
    });

    await expect(market.install('issues')).resolves.toBeDefined();
    expect(fake.commands()).toHaveLength(4);
    expect(fake.commands()[3]).toContain('plugin install');
  });

  it('★ 已装就不重复装（幂等：一条命令都不跑）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' })],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
    });

    await market.install('issues');

    expect(fake.commands()).toEqual([]);
  });

  it('未装 + 来源解析得出 → 跑 plugin install <spec>', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x:demo.git' })],
      probe: probeOf({ issues: 'missing-plugin' }),
      shell: fake.shell,
      command: 'opencli',
    });

    await market.install('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin install 'git@x:demo.git'"]);
  });

  it('local 来源 + 环境变量设了 → 用那一条 spec 装', async () => {
    vi.stubEnv('DSH_WORKBENCH_TEST_PLUGIN', '/opt/plugin');
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'local', env: 'DSH_WORKBENCH_TEST_PLUGIN' })],
      probe: probeOf({ issues: 'missing-plugin' }),
      shell: fake.shell,
    });

    await market.install('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin install '/opt/plugin'"]);
  });

  it('★ local 来源但环境变量没设 → 抛，且**一条命令都不跑**', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'local', env: 'DSH_WORKBENCH_TEST_UNSET' })],
      probe: probeOf({ issues: 'missing-plugin' }),
      shell: fake.shell,
    });

    await expect(market.install('issues')).rejects.toThrow(/DSH_WORKBENCH_TEST_UNSET/);
    expect(fake.commands()).toEqual([]);
  });

  it('★ 还有别的模块要它（哪怕它停用着）→ 那份安装**留着**，模块照样卸掉', async () => {
    const onUninstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo'), unit('builds', 'demo')],
      probe: probeOf({ issues: 'ok', builds: 'ok' }),
      shell: fake.shell,
      onUninstalled,
      isReleased: () => false,
    });

    const { entry, keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual([]);
    expect(onUninstalled).toHaveBeenCalledWith('issues');
    expect(keptFor).toEqual(['builds']);
    expect(entry.unit).toBe('issues');
  });

  it('★ 顺序：先探出"卸完之后的样子"、**再**通知装配方（否则右栏卡片会早于 loading 消失）', async () => {
    const order: string[] = [];
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo')],
      probe: async (id: string): Promise<UnitCapability> => {
        order.push(`probe:${id}`);
        return { unit: id, status: 'ok', required: [], missing: [], detail: '假探测' };
      },
      shell: fake.shell,
      onUninstalled: () => order.push('release'),
    });

    const { entry } = await market.uninstall('issues');

    expect(order[order.length - 1]).toBe('release');
    expect(order).toContain('probe:issues');
    expect(entry.capability.released).toBe(true);
  });

  it('★ 本来就没装（未装状态）→ 卸的时候不跑命令，也不报错（别拿 CLI 的"没这个插件"打用户）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo')],
      probe: probeOf({ issues: 'missing-plugin' }),
      shell: fake.shell,
    });

    await expect(market.uninstall('issues')).resolves.toBeDefined();
    expect(fake.commands()).toEqual([]);
  });

  it('★ 动用户装的插件之后，声明它的模块要重探一遍（"会不会弄坏"得落在面板上）', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-market-reprobe-'));
    const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-inventory', 'inventory');
    const probe = vi.fn(
      async (id: string): Promise<UnitCapability> => ({
        unit: id,
        status: 'ok',
        required: [],
        missing: [],
        detail: '假探测',
      }),
    );
    const fake = createFakeShell((call) =>
      call.command.includes('npm view') ? { stdout: '1.0.25\n' } : { stdout: '' },
    );
    const market = createMarketService({
      manifests: [unit('builds', 'inventory')],
      probe,
      shell: fake.shell,
      ledger,
      references: () => ({ trustworthy: true, unreadable: [] }),
    });

    await market.updatePlugin('opencli-plugin-inventory');
    expect(probe).toHaveBeenCalledWith('builds', { force: true });

    probe.mockClear();
    await market.uninstallPlugin('opencli-plugin-inventory');
    fs.rmSync(root, { recursive: true, force: true });

    expect(probe).toHaveBeenCalledWith('builds', { force: true });
  });

  it('★ 没有执行缝 → 动作抛（说清"能看不能装"），列表照常', async () => {
    const market = createMarketService({
      manifests: [unit('issues', 'demo', { kind: 'git', url: 'git@x' })],
      probe: probeOf({ issues: 'missing-plugin' }),
    });

    expect((await market.list()).modules).toHaveLength(1);
    await expect(market.install('issues')).rejects.toThrow(/没有执行缝/);
  });

  it('命令非零退出 → 抛，并把输出尾巴带上（那才是能排查的东西）', async () => {
    const fake = createFakeShell([{ exitCode: 1, stderr: 'npm error boom' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo')],
      probe: probeOf({ issues: 'missing-commands' }),
      shell: fake.shell,
    });

    await expect(market.update('issues')).rejects.toThrow(/npm error boom/);
  });

  it('未知模块 → 抛，并列出可安装的（静默忽略会让调用方以为成功了）', async () => {
    const market = createMarketService({ manifests: [unit('issues', 'demo')], probe: probeOf({}) });

    await expect(market.install('nope')).rejects.toThrow(/市场里没有这个模块：nope（可安装：issues）/);
  });

  it('探不动 → 不谎报"已装"（给 unchecked）', async () => {
    const market = createMarketService({ manifests: [unit('issues', 'demo')] });

    const { modules } = await market.list();
    const [entry] = modules;

    expect(entry?.capability.status).toBe('unchecked');
  });

  it('★ 共用一份安装：动它之后，声明它的**别的**模块也强探一遍（否则它们停在旧结论上）', async () => {
    const probe = vi.fn<(id: string, options?: { force?: boolean }) => Promise<UnitCapability>>(
      probeOf({ issues: 'ok', other: 'ok' }),
    );
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [
        unit('issues', 'demo', { kind: 'git', url: 'git@x:demo.git' }),
        unit('other', 'demo', { kind: 'git', url: 'git@x:demo.git' }),
      ],
      probe,
      shell: fake.shell,
    });

    await market.update('issues');
    await market.uninstall('other');

    const probed = probe.mock.calls.map(
      ([id, options]: [string, ({ force?: boolean } | undefined)?]) =>
        `${id}:${options?.force === true ? 'force' : 'cache'}`,
    );

    expect(probed).toContain('other:force');
    expect(probed).toContain('issues:force');
  });

  it('★ 更新命令跑完还是旧的样子 → 抛出原因，不许假成功', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      manifests: [unit('issues', 'demo')],
      probe: async (id: string): Promise<UnitCapability> => ({
        unit: id,
        status: 'missing-commands',
        required: ['x'],
        missing: ['x'],
        detail: '缺必需：x',
        fix: 'update',
        plugins: [{ name: 'demo', status: 'outdated', missing: ['x'] }],
      }),
      shell: fake.shell,
    });

    await expect(market.update('issues')).rejects.toThrow(/还是旧的样子/);
  });

  it('★ 这一行说要更新、却没有可执行的更新命令 → 也说清，不静默返回', async () => {
    const market = createMarketService({
      manifests: [unit('issues', 'demo')],
      probe: async (id: string): Promise<UnitCapability> => ({
        unit: id,
        status: 'missing-commands',
        required: ['x'],
        missing: ['x'],
        detail: '缺必需：x',
        fix: 'update',
        plugins: [{ name: 'demo', status: 'ok', missing: ['x'] }],
      }),
    });

    await expect(market.update('issues')).rejects.toThrow(/没有可执行的更新命令/);
  });
});
