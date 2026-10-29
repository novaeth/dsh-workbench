import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import { PLUGIN_LEDGER_FILE } from '@dsh-workbench/shared/host';
import { createPluginLedger } from '../model/plugin-ledger';

const HOME_A = '/tmp/wb-ledger-a/workbench/opencli/home';
const HOME_B = '/tmp/wb-ledger-b/workbench/opencli/home';

let root = '';
const roots: string[] = [];

function ledgerAt(home: string) {
  return createPluginLedger({
    store: createWorkspaceStore({ root }),
    home,
    pluginFiles: { dir: path.join(home, '..', 'plugins-npm', 'node_modules'), manifest: 'opencli-plugin.json' },
  });
}

function fileOf(): string {
  return path.join(root, '_machine', 'panels', PLUGIN_LEDGER_FILE);
}

function rawOf(): { entries: readonly { home: string; package: string }[] } {
  return JSON.parse(fs.readFileSync(fileOf(), 'utf8')) as {
    entries: readonly { home: string; package: string }[];
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ledger-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  for (const extra of roots.splice(0)) fs.rmSync(extra, { recursive: true, force: true });
});

describe('opencli 插件台账：机器级配置那一套（_machine/panels/plugins.json）', () => {
  it('★ 落在 _machine/panels/plugins.json，条目带上 opencli home、包名、源与装的时候', () => {
    const ledger = ledgerAt(HOME_A);
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/team/' });

    expect(fs.existsSync(fileOf())).toBe(true);
    const [entry] = ledger.list();
    expect(entry).toMatchObject({
      home: HOME_A,
      package: 'opencli-plugin-inventory',
      registry: 'https://r.example/team/',
    });
    expect(entry?.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('★ 两个 home 各记各的：同一个包名不互相覆盖，删一个不动另一个', () => {
    const a = ledgerAt(HOME_A);
    const b = ledgerAt(HOME_B);
    a.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });
    b.intend({ package: 'opencli-plugin-inventory', registry: 'https://other.example/' });

    expect(a.list()).toHaveLength(1);
    expect(b.list()).toHaveLength(1);
    expect(rawOf().entries).toHaveLength(2);

    a.drop('opencli-plugin-inventory');

    expect(a.list()).toHaveLength(0);
    expect(a.read('opencli-plugin-inventory')).toBeUndefined();
    expect(b.read('opencli-plugin-inventory')?.registry).toBe('https://other.example/');
    expect(rawOf().entries).toEqual([
      expect.objectContaining({ home: HOME_B, package: 'opencli-plugin-inventory' }),
    ]);
  });

  it('★ 装完读一次 manifest 把插件名补上（显示名），没补上就退回包名', () => {
    const ledger = ledgerAt(HOME_A);
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-inventory', 'inventory');

    expect(ledger.read('opencli-plugin-inventory')?.name).toBe('inventory');
    expect(ledger.read('opencli-plugin-inventory')?.installedAt).toBeDefined();

    ledger.complete('opencli-plugin-inventory', '   ');
    expect(ledger.read('opencli-plugin-inventory')?.name).toBe('inventory');
  });

  it('本地目录装的记 local（没有源，也就没有可查的新版）；空台账把文件删掉', () => {
    const ledger = ledgerAt(HOME_A);
    ledger.intend({ package: '/Users/me/my-plugin', local: true });

    expect(ledger.read('/Users/me/my-plugin')?.local).toBe(true);
    expect(ledger.read('/Users/me/my-plugin')?.registry).toBeUndefined();

    ledger.drop('/Users/me/my-plugin');
    expect(fs.existsSync(fileOf())).toBe(false);
  });

  it('解不开 / 不成形的条目一律丢掉，不让一行坏记录把整份台账带坏', () => {
    fs.mkdirSync(path.dirname(fileOf()), { recursive: true });
    fs.writeFileSync(
      fileOf(),
      JSON.stringify({
        entries: [
          { home: HOME_A, package: 'good', installedAt: '2026-10-14T00:00:00.000Z' },
          { home: HOME_A, package: 'no-time' },
          { package: 'no-home', installedAt: '2026-10-14T00:00:00.000Z' },
          'nonsense',
          null,
        ],
      }),
      'utf8',
    );

    expect(ledgerAt(HOME_A).list().map((entry) => entry.package)).toEqual(['good']);
  });

  it('★ 放手那一笔：界面那一段少一行，但文件里还记着"这是我们装的"（自动清就靠它）', () => {
    const ledger = ledgerAt(HOME_A);
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-inventory', 'inventory');

    ledger.release('opencli-plugin-inventory');

    expect(ledger.list()).toEqual([]);
    expect(ledger.read('opencli-plugin-inventory')).toBeUndefined();
    expect(ledger.all().map((entry) => entry.package)).toEqual(['opencli-plugin-inventory']);
    expect(ledger.all()[0]?.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rawOf().entries).toHaveLength(1);
  });

  it('★ 用户又装一次 → 那一笔恢复成"持着"（放手不是永久判决）', () => {
    const ledger = ledgerAt(HOME_A);
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });
    ledger.release('opencli-plugin-inventory');

    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });

    expect(ledger.read('opencli-plugin-inventory')?.releasedAt).toBeUndefined();
    expect(ledger.all()).toHaveLength(1);
  });

  it('★ 按插件名找"用户持着的"那一份：模块放手时要拿插件名去问（模块写的是插件名）', () => {
    const ledger = ledgerAt(HOME_A);
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });
    ledger.complete('opencli-plugin-inventory', 'inventory');

    expect(ledger.heldAsPlugin('inventory')?.package).toBe('opencli-plugin-inventory');
    expect(ledger.heldAsPlugin('opencli-plugin-inventory')?.name).toBe('inventory');
    expect(ledger.heldAsPlugin('别的插件')).toBeUndefined();

    ledger.release('opencli-plugin-inventory');
    expect(ledger.heldAsPlugin('inventory')).toBeUndefined();
  });

  it('★ 台账没记上插件名 → 按现读出来的名字也认得出"这是用户持着的那一份"', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ledger-name-'));
    roots.push(home);
    const dir = path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', 'opencli-plugin-inventory');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'opencli-plugin.json'), JSON.stringify({ name: 'inventory' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'list.js'), 'x', 'utf8');

    const ledger = createPluginLedger({
      store: createWorkspaceStore({ root }),
      home: HOME_A,
      pluginFiles: {
        dir: path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules'),
        manifest: 'opencli-plugin.json',
      },
    });
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });

    expect(ledger.read('opencli-plugin-inventory')?.name).toBeUndefined();
    process.env['DSH_HOME'] = home;
    try {
      expect(ledger.heldAsPlugin('inventory')?.package).toBe('opencli-plugin-inventory');
    } finally {
      delete process.env['DSH_HOME'];
    }
    expect(ledger.heldAsPlugin('别的')).toBeUndefined();
  });

  it('放手 + 彻底忘掉是两件事：drop 才是真的把那一笔划掉', () => {
    const ledger = ledgerAt(HOME_A);
    ledger.intend({ package: 'opencli-plugin-inventory', registry: 'https://r.example/' });
    ledger.drop('opencli-plugin-inventory');

    expect(ledger.all()).toEqual([]);
    expect(fs.existsSync(fileOf())).toBe(false);
  });
});
