import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { NeedState, SupplySource, UnitManifest } from '@dsh-workbench/shared';
import { extensionNeedOf, libNeedOf, needStateOf } from '@dsh-workbench/shared/testing';
import { createEnvDropper } from '../model/market-env';
import { createMarketService } from '../model/market';
import { createPluginLedger } from '../model/plugin-ledger';

function unit(id: string, plugin: string, sources?: readonly SupplySource[]): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [extensionNeedOf(plugin, { commands: ['x'], ...(sources === undefined ? {} : { sources }) })],
  };
}

const DEMO = extensionNeedOf('demo', { commands: ['x'] });
const LODASH = libNeedOf('lodash', {
  purpose: '工具',
  sources: [{ kind: 'npm', registryEnv: 'DSH_WB_TEST_REGISTRY', registryDefault: 'https://r.example/' }],
});

const probeOf =
  (statuses: Readonly<Record<string, string>>, names: readonly string[] = ['demo']) =>
  async (id: string): Promise<UnitCapability> => {
    const status = (statuses[id] ?? 'ok') as CapabilityStatus;
    const one: NeedState['status'] = status === 'ok' ? 'ok' : status === 'outdated' ? 'outdated' : 'missing';
    return {
      unit: id,
      status,
      needs: names.map((name) => needStateOf(extensionNeedOf(name, { commands: ['x'] }), one)),
    };
  };

type CapabilityStatus = UnitCapability['status'];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('模块放手（卸掉一个模块）时，它带来的那份安装谁说了算', () => {
  it('★ 别的模块也**放手**了（卸过）→ 那份安装才真的删掉（死角就没了）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo'), unit('builds', 'demo')],
      probe: probeOf({ issues: 'ok', builds: 'ok' }),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      isReleased: (id) => id === 'builds',
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
    expect(keptFor).toEqual([]);
  });

  it('★ 一个模块要两份、只有一份还有人要 → 只删没人要的那份', async () => {
    const twoNeeds: UnitManifest = {
      id: 'issues',
      titleKey: 'issues.mine', card: { order: 10 },
      tools: [],
      host: { inject: [] },
      needs: [
        extensionNeedOf('demo', { commands: ['x'], sources: [{ kind: 'git', url: 'git@x:demo.git' }] }),
        extensionNeedOf('deploy', { commands: ['y'], sources: [{ kind: 'git', url: 'git@x:deploy.git' }] }),
      ],
    };
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [twoNeeds, unit('builds', 'demo')],
      probe: probeOf({ issues: 'ok', builds: 'ok' }, ['demo', 'deploy']),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
      isReleased: () => false,
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'deploy'"]);
    expect(keptFor).toEqual(['builds']);
  });

  it('独占插件 → 真的卸', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo')],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
      references: () => ({ trustworthy: true, unreadable: [] }),
    });

    await market.uninstall('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
  });

  it('★ 引用不可信 → 模块放手也不动文件，并说清为什么（今天这台机器就是这一档）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const logs: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo')],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
      references: () => ({ trustworthy: false, unreadable: ['@a/mod'] }),
      logger: { info: (message) => logs.push(message) },
    });

    await market.uninstall('issues');

    expect(fake.commands()).toEqual([]);
    expect(logs[0]).toContain('@a/mod');
    expect(logs[0]).toContain('文件先留着');
  });

  it('★ 用户自己还持着这一份 → 模块放手不碰它（模块放手与用户持有是两件事）', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-market-held-'));
    const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
    ledger.intend({ package: 'opencli-plugin-demo', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-demo', 'demo');
    const fake = createFakeShell([{ stdout: '' }]);
    const logs: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo')],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
      ledger,
      references: () => ({ trustworthy: true, unreadable: [] }),
      logger: { info: (message) => logs.push(message) },
    });

    await market.uninstall('issues');

    expect(fake.commands()).toEqual([]);
    expect(logs[0]).toContain('你自己装的那一份');
    expect(ledger.read('opencli-plugin-demo')).toBeDefined();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('★ 模块放手之后顺手自动清：先前放手、现在没人要的那一份，文件也删了', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-market-sweep-'));
    const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
    ledger.intend({ package: 'opencli-plugin-deploy', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-deploy', 'deploy');
    ledger.release('opencli-plugin-deploy');
    const fake = createFakeShell([{ stdout: '' }]);
    const logs: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo')],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
      ledger,
      references: () => ({ trustworthy: true, unreadable: [] }),
      logger: { info: (message) => logs.push(message) },
    });

    await market.uninstall('issues');

    expect(fake.commands()).toEqual([
      "'opencli' plugin uninstall 'demo'",
      "'opencli' plugin uninstall 'deploy'",
    ]);
    expect(ledger.all()).toEqual([]);
    expect(logs.some((line) => line.includes('opencli-plugin-deploy'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('放手那一格自己：谁在用、引用可不可信，两件事一起说', () => {
  const capability: UnitCapability = {
    unit: 'issues',
    status: 'ok',
    needs: [needStateOf(DEMO, 'ok'), needStateOf(LODASH, 'ok', { installed: '1.0.0' })],
    detail: '假探测',
  };

  function capabilityWith(needs: readonly NeedState[]): UnitCapability {
    return { ...capability, needs: [...needs] };
  }

  function makeDropper(options: {
    catalog: readonly UnitManifest[];
    released?: readonly string[];
    references?: { trustworthy: boolean; unreadable: readonly string[] };
  }) {
    const runs: string[] = [];
    const logs: string[] = [];
    const dropper = createEnvDropper({
      catalog: () => options.catalog,
      isReleased: (id) => (options.released ?? []).includes(id),
      ...(options.references === undefined ? {} : { references: () => options.references as never }),
      command: 'opencli',
      run: async (line) => {
        runs.push(line);
      },
      logger: { info: (message) => logs.push(message) },
    });
    return { dropper, runs, logs };
  }

  it('用户连一个主张者都没有、引用也可信 → 插件与共用库都真的清掉', async () => {
    const { dropper, runs } = makeDropper({
      catalog: [unit('issues', 'demo')],
      references: { trustworthy: true, unreadable: [] },
    });

    const keptFor = await dropper.drop('issues', [DEMO, LODASH], capability);

    expect(runs[0]).toBe("'opencli' plugin uninstall 'demo'");
    expect(runs[1]).toContain('npm uninstall --prefix');
    expect(runs[1]).toContain("'lodash'");
    expect(keptFor).toEqual([]);
  });

  it('★ 引用不可信 → 插件那侧一根手指都不碰，还说清为什么（库里那份照旧）', async () => {
    const { dropper, runs, logs } = makeDropper({
      catalog: [unit('issues', 'demo')],
      references: { trustworthy: false, unreadable: ['@a/mod'] },
    });

    await dropper.drop('issues', [DEMO], capability);

    expect(runs).toEqual([]);
    expect(logs[0]).toContain('文件先留着');
  });

  it('别的模块（哪怕它已经放手过）还要 → 插件那侧不碰，并把主张者报出来', async () => {
    const { dropper, runs } = makeDropper({
      catalog: [unit('issues', 'demo'), unit('builds', 'demo')],
      references: { trustworthy: true, unreadable: [] },
    });

    const keptFor = await dropper.drop('issues', [DEMO], capability);

    expect(runs).toEqual([]);
    expect(keptFor).toEqual(['builds']);
  });

  it('★ 用户自己还持着那一份 → 模块放手也不碰它（用户持有是另一条主张）', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-env-held-'));
    const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
    ledger.intend({ package: 'opencli-plugin-demo', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-demo', 'demo');
    const runs: string[] = [];
    const dropper = createEnvDropper({
      catalog: () => [unit('issues', 'demo')],
      ledger,
      references: () => ({ trustworthy: true, unreadable: [] }),
      command: 'opencli',
      run: async (line) => {
        runs.push(line);
      },
    });

    await dropper.drop('issues', [DEMO], capability);
    fs.rmSync(root, { recursive: true, force: true });

    expect(runs).toEqual([]);
  });

  it('★ 用户那份没记上插件名 → 现读 manifest 也认得出，模块放手照样不碰它', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-env-name-'));
    const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-env-home-'));
    const dir = path.join(dshHome, 'workbench', 'opencli', 'plugins-npm', 'node_modules', 'opencli-plugin-demo');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'opencli-plugin.json'), JSON.stringify({ name: 'demo' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'list.js'), 'x', 'utf8');
    const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
    ledger.intend({ package: 'opencli-plugin-demo', registry: 'https://r.example/' });
    const runs: string[] = [];
    const dropper = createEnvDropper({
      catalog: () => [unit('issues', 'demo')],
      ledger,
      references: () => ({ trustworthy: true, unreadable: [] }),
      command: 'opencli',
      run: async (line) => {
        runs.push(line);
      },
    });

    process.env['DSH_HOME'] = dshHome;
    try {
      await dropper.drop('issues', [DEMO], capability);
    } finally {
      delete process.env['DSH_HOME'];
    }
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dshHome, { recursive: true, force: true });

    expect(runs).toEqual([]);
  });

  it('没接上探针 → 按不可信办（忘接线不会变成"见谁都删"）', async () => {
    const { dropper, runs } = makeDropper({ catalog: [unit('issues', 'demo')] });

    await dropper.drop('issues', [DEMO], capability);

    expect(runs).toEqual([]);
  });

  it('★ 探得到、本来就没装 → 不跑命令（别拿 CLI 的"没这个插件"打用户）', async () => {
    const { dropper, runs } = makeDropper({
      catalog: [unit('issues', 'demo')],
      references: { trustworthy: true, unreadable: [] },
    });

    await dropper.drop('issues', [DEMO], capabilityWith([needStateOf(DEMO, 'missing')]));

    expect(runs).toEqual([]);
  });

  it('探不到它装没装（unknown）→ 交给 CLI 自己判断（这一格的口径没变）', async () => {
    const unknown: UnitCapability = { ...capability, needs: [] };
    const { dropper, runs } = makeDropper({
      catalog: [unit('issues', 'demo')],
      references: { trustworthy: true, unreadable: [] },
    });

    await dropper.drop('issues', [DEMO], unknown);

    expect(runs).toEqual(["'opencli' plugin uninstall 'demo'"]);
  });
});

describe('自动清的另一个时机：模块更新（它的声明可能变了）', () => {
  it('★ 先前放手、现在没人要的那一份，跟着模块更新一起清掉', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-market-sweep2-'));
    const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/wb-home' });
    ledger.intend({ package: 'opencli-plugin-deploy', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-deploy', 'deploy');
    ledger.release('opencli-plugin-deploy');
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo')],
      probe: probeOf({ issues: 'ok' }),
      shell: fake.shell,
      ledger,
      references: () => ({ trustworthy: true, unreadable: [] }),
      bundles: {
        registries: async () => null,
        inspect: async () => null,
        cancel: async () => 'cancelled',
        install: async (request) => ({
          application: 'restart-required',
          stage: 'install',
          changed: true,
          target: request.spec,
          bundle: 'opencli-plugin-deploy',
        }),
        remove: async (name) => ({ application: 'applied', stage: 'remove', changed: true, target: name }),
      },
      installed: () => ({ kind: 'unknown', pkg: '@a/issues' }),
      modules: () => [{ pkg: '@a/issues', unit: 'issues', version: '0.1.0' }],
    });

    await market.updateBundle('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'deploy'"]);
    expect(ledger.all()).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
