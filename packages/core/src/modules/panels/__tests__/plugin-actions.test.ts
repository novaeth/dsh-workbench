import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createPluginActions } from '../model/plugin-actions';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';

const HOME = '/tmp/wb-actions/workbench/opencli/home';
const REGISTRY = 'https://r.example/team/';
const PKG = 'opencli-plugin-inventory';
const roots: string[] = [];

function dirOf(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-actions-'));
  roots.push(root);
  const at = path.join(root, name);
  fs.mkdirSync(at, { recursive: true });
  return at;
}

function put(at: string, file: string, body: unknown): void {
  const target = path.join(at, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
}

function ledgerAt(root: string): PluginLedger {
  return createPluginLedger({ store: createWorkspaceStore({ root }), home: HOME });
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('用户持有的 opencli 插件：更新与卸载（台账那一笔说了算）', () => {
  it('★ 更新照台账那一笔问新版（包名 + 源），装的是问回来的那个版本', async () => {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    ledger.complete(PKG, 'inventory');
    const fake = createFakeShell([{ stdout: '1.0.25\n' }, { stdout: '' }, { stdout: '' }]);
    const actions = createPluginActions({ ledger, shell: fake.shell, command: 'opencli', runAll: async () => {} });

    await actions.update(PKG);

    expect(
      fake.commands().some((line) => line.includes(`npm view '${PKG}' version --registry '${REGISTRY}'`)),
    ).toBe(true);
  });

  it('更新一路用的是已有的安装器（npm i 到 plugins-npm，再让 opencli 认它）', async () => {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    const runs: string[][] = [];
    const fake = createFakeShell([{ stdout: '1.0.25\n' }]);
    const actions = createPluginActions({
      ledger,
      shell: fake.shell,
      command: 'opencli',
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
    });

    await actions.update(PKG);

    expect(runs).toHaveLength(1);
    const lines = runs[0] ?? [];
    expect(lines[0]).toContain(`'${PKG}@1.0.25'`);
    expect(lines.at(-1)).toContain("'opencli' plugin install");
    expect(ledger.read(PKG)).toMatchObject({ package: PKG, registry: REGISTRY });
  });

  it('本地装的那一笔更新不了，说的是人话（没地方查新版）', async () => {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: '/Users/me/my-plugin', local: true });
    const actions = createPluginActions({ ledger, command: 'opencli', runAll: async () => {} });

    await expect(actions.update('/Users/me/my-plugin')).rejects.toThrow('没有地方查新版');
  });

  it('台账里没有的那一笔更新不了（不猜一个包名去装）', async () => {
    const actions = createPluginActions({ ledger: ledgerAt(dirOf('store')), command: 'opencli', runAll: async () => {} });

    await expect(actions.update('opencli-plugin-nope')).rejects.toThrow('台账里没有');
  });

  it('问不到新版就不动手（不拿一个猜的版本去装）', async () => {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    const fake = createFakeShell([{ stdout: '不是版本号\n' }]);
    const actions = createPluginActions({ ledger, shell: fake.shell, command: 'opencli', runAll: async () => {} });

    await expect(actions.update(PKG)).rejects.toThrow('问不到');
    expect(fake.commands().filter((line) => line.includes('npm i --prefix'))).toEqual([]);
  });

  it('★ 卸载只去掉台账那一笔：机器上的文件这一格一个字节不动（物理删是下一格）', async () => {
    const home = dirOf('dsh-home');
    vi.stubEnv('DSH_HOME', home);
    const installed = path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', PKG);
    put(installed, 'opencli-plugin.json', { name: 'inventory' });
    put(installed, 'list.js', 'x');
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    const actions = createPluginActions({ ledger, command: 'opencli', runAll: async () => {} });

    await actions.uninstall(PKG);

    expect(ledger.read(PKG)).toBeUndefined();
    expect(ledger.list()).toEqual([]);
    expect(fs.existsSync(path.join(installed, 'opencli-plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(installed, 'list.js'))).toBe(true);
  });

  it('★ 台账里没有那一笔 → 抛，并列出你装了哪些（报错要能照做）', async () => {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    ledger.complete(PKG, 'inventory');
    const actions = createPluginActions({ ledger, command: 'opencli', runAll: async () => {} });

    await expect(actions.uninstall('没有这个')).rejects.toThrow(/inventory/);
  });

  it('没有台账就没有这两件事可做（不假装成功）', async () => {
    const actions = createPluginActions({ command: 'opencli', runAll: async () => {} });

    await expect(actions.update(PKG)).rejects.toThrow('没有台账');
    await expect(actions.uninstall(PKG)).rejects.toThrow('没有台账');
  });
});

describe('物理去留：谁主张谁说话（动作永远可用，删不删看引用）', () => {
  function heldLedger(): PluginLedger {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    ledger.complete(PKG, 'inventory');
    return ledger;
  }

  it('★ 引用可信 + 没人用它 → 真删：跑一次 opencli 的卸载，台账那一笔也忘掉', async () => {
    const ledger = heldLedger();
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
    });

    const outcome = await actions.uninstall(PKG);

    expect(runs).toEqual([["'opencli' plugin uninstall 'inventory'"]]);
    expect(outcome).toEqual({ removed: true, name: 'inventory' });
    expect(ledger.read(PKG)).toBeUndefined();
    expect(ledger.all()).toEqual([]);
  });

  it('★ 还有模块在用 → 文件留着，台账那一行消失，并说清为什么', async () => {
    const ledger = heldLedger();
    const logs: string[] = [];
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => ['issues', 'inventory'],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
      logger: { info: (message) => logs.push(message) },
    });

    const outcome = await actions.uninstall(PKG);

    expect(runs).toEqual([]);
    expect(outcome).toEqual({
      removed: false,
      name: 'inventory',
      kept: { kind: 'claimed', by: ['issues', 'inventory'] },
    });
    expect(logs[0]).toContain('issues、inventory 还要用它');
    expect(ledger.read(PKG)).toBeUndefined();
    expect(ledger.all()).toHaveLength(1);
  });

  it('★ 引用不可信 → 一根手指都不碰文件，说清为什么留着（今天这台机器就是这一档）', async () => {
    const ledger = heldLedger();
    const logs: string[] = [];
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: false, unreadable: ['@a/mod'] }),
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
      logger: { info: (message) => logs.push(message) },
    });

    const outcome = await actions.uninstall(PKG);

    expect(runs).toEqual([]);
    expect(outcome).toEqual({ removed: false, name: 'inventory', kept: { kind: 'unsure', unreadable: ['@a/mod'] } });
    expect(logs[0]).toContain('@a/mod');
    expect(logs[0]).toContain('文件先留着');
    expect(ledger.read(PKG)).toBeUndefined();
  });

  it('没接上可信度探针 → 也按不可信办（忘接线不会变成"见谁都删"）', async () => {
    const ledger = heldLedger();
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
    });

    const outcome = await actions.uninstall(PKG);

    expect(runs).toEqual([]);
    expect(outcome).toEqual({ removed: false, name: 'inventory', kept: { kind: 'unsure', unreadable: [] } });
  });
});

describe('自动清：先前放手、现在没人要的那一份，跟着删掉', () => {
  function releasedLedger(): PluginLedger {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    ledger.complete(PKG, 'inventory');
    ledger.release(PKG);
    return ledger;
  }

  it('★ 放手了 + 没人用 + 引用可信 → 清掉文件与那一笔，并留一句话', async () => {
    const ledger = releasedLedger();
    const logs: string[] = [];
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
      logger: { info: (message) => logs.push(message) },
    });

    expect(await actions.sweep()).toEqual([PKG]);

    expect(runs).toEqual([["'opencli' plugin uninstall 'inventory'"]]);
    expect(ledger.all()).toEqual([]);
    expect(logs[0]).toContain(PKG);
  });

  it('还有人用 → 不清（那一条本来就在「共用依赖」里）', async () => {
    const ledger = releasedLedger();
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => ['issues'],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async () => {
        throw new Error('不该跑命令');
      },
    });

    expect(await actions.sweep()).toEqual([]);
    expect(ledger.all()).toHaveLength(1);
  });

  it('引用不可信 → 不清（等这台机器的模块都说清自己用什么，它自己会放开）', async () => {
    const ledger = releasedLedger();
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: false, unreadable: ['@a/mod'] }),
      runAll: async () => {
        throw new Error('不该跑命令');
      },
    });

    expect(await actions.sweep()).toEqual([]);
    expect(ledger.all()).toHaveLength(1);
  });

  it('用户还持着的（没放手）不清（模块放手不动用户的）', async () => {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    ledger.complete(PKG, 'inventory');
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async () => {
        throw new Error('不该跑命令');
      },
    });

    expect(await actions.sweep()).toEqual([]);
    expect(ledger.read(PKG)).toBeDefined();
  });

  it('清不动（命令失败）→ 那一笔留着，下一次再试，不静默丢账', async () => {
    const ledger = releasedLedger();
    const logs: string[] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async (commands) => {
        throw new Error(`命令失败：${commands[0]?.line ?? ''}`);
      },
      logger: { warn: (message) => logs.push(message) },
    });

    expect(await actions.sweep()).toEqual([]);
    expect(ledger.all()).toHaveLength(1);
    expect(logs[0]).toContain(PKG);
  });
});

describe('插件名：台账没记上就现读一次（名字也是主张的键，猜错就会删错）', () => {
  function pluginHome(manifest: unknown, files: readonly string[] = ['list.js']): string {
    const home = dirOf('dsh-home');
    vi.stubEnv('DSH_HOME', home);
    const installed = path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', PKG);
    put(installed, 'opencli-plugin.json', manifest);
    for (const file of files) put(installed, file, 'x');
    return home;
  }

  function unnamedLedger(): PluginLedger {
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: PKG, registry: REGISTRY });
    return ledger;
  }

  it('★ 名字 ≠ 包名、台账又没记 → 现读 manifest 认出「inventory」，模块还要用就不删', async () => {
    pluginHome({ name: 'inventory' });
    const ledger = unnamedLedger();
    expect(ledger.read(PKG)?.name).toBeUndefined();
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: (plugin) => (plugin === 'inventory' ? ['issues'] : []),
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
    });

    const outcome = await actions.uninstall(PKG);

    expect(runs).toEqual([]);
    expect(outcome).toEqual({
      removed: false,
      name: 'inventory',
      kept: { kind: 'claimed', by: ['issues'] },
    });
  });

  it('★ 现读出来的名字也用在真删那条命令上（不是拿包名去卸）', async () => {
    pluginHome({ name: 'inventory' });
    const ledger = unnamedLedger();
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
    });

    expect(await actions.uninstall(PKG)).toEqual({ removed: true, name: 'inventory' });
    expect(runs).toEqual([["'opencli' plugin uninstall 'inventory'"]]);
  });

  it('★ 名字都读不出来（清单不在 / 解不开 / 没有命令文件）→ 一律不删，说清为什么', async () => {
    pluginHome({ name: 'inventory' }, []);
    const ledger = unnamedLedger();
    const logs: string[] = [];
    const runs: string[][] = [];
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async (commands) => {
        runs.push(commands.map((step) => step.line));
      },
      logger: { info: (message) => logs.push(message) },
    });

    const outcome = await actions.uninstall(PKG);

    expect(runs).toEqual([]);
    expect(outcome).toEqual({ removed: false, kept: { kind: 'unnamed' } });
    expect(logs[0]).toContain('看不出这是哪个插件');
  });

  it('★ 自动清同样不敢删没名字的那一份（同一条判据，不是两套）', async () => {
    pluginHome({ name: 'inventory' }, []);
    const ledger = unnamedLedger();
    ledger.release(PKG);
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: () => [],
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async () => {
        throw new Error('不该跑命令');
      },
    });

    expect(await actions.sweep()).toEqual([]);
    expect(ledger.all()).toHaveLength(1);
  });

  it('本地目录装的那一份按目录读 manifest（插件名与包名本来就不会相等）', async () => {
    const at = dirOf('local-plugin');
    put(at, 'opencli-plugin.json', { name: 'mine' });
    put(at, 'run.js', 'x');
    const ledger = ledgerAt(dirOf('store'));
    ledger.intend({ package: at, local: true });
    const actions = createPluginActions({
      ledger,
      shell: createFakeShell([{ stdout: '' }]).shell,
      command: 'opencli',
      claimedBy: (plugin) => (plugin === 'mine' ? ['issues'] : []),
      references: () => ({ trustworthy: true, unreadable: [] }),
      runAll: async () => {
        throw new Error('不该跑命令');
      },
    });

    expect(await actions.uninstall(at)).toEqual({
      removed: false,
      name: 'mine',
      kept: { kind: 'claimed', by: ['issues'] },
    });
  });
});
