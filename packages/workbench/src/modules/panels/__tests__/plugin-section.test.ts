import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { resetReleaseCache } from '@/shared/api/host/release';
import { INSTALLED_PLUGINS_ROUTE } from '@/shared/api/installed-plugins';
import { installedPlugins, pluginRoutes } from '../model/plugin-section';
import { createPluginLedger } from '../model/plugin-ledger';

const HOME = '/tmp/wb-section/workbench/opencli/home';
const REGISTRY = 'https://r.example/team/';
const PKG = 'opencli-plugin-inventory';

let root = '';
let dsh = '';

function putPlugin(name: string, pkg: string = PKG): void {
  const dir = path.join(dsh, 'workbench', 'opencli', 'plugins-npm', 'node_modules', pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'opencli-plugin.json'), JSON.stringify({ name }), 'utf8');
  fs.writeFileSync(path.join(dir, 'list.js'), 'x', 'utf8');
}

function rig() {
  const ledger = createPluginLedger({ store: createWorkspaceStore({ root }), home: HOME });
  return ledger;
}

function shellOf(installed: string, latest: string) {
  return createFakeShell((call) =>
    call.command.startsWith('npm ls')
      ? { stdout: JSON.stringify({ dependencies: { [PKG]: { version: installed } } }) }
      : { stdout: `${latest}\n` },
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-section-'));
  dsh = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-section-dsh-'));
  resetReleaseCache();
  vi.stubEnv('DSH_HOME', dsh);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetReleaseCache();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(dsh, { recursive: true, force: true });
});

describe('「已安装 opencli 插件」那一段的数据：台账说了算', () => {
  it('★ 台账那一笔决定问哪个包、问哪个源（新版那一半复用 release.ts 的同一份代码）', async () => {
    const ledger = rig();
    ledger.intend({ package: PKG, registry: REGISTRY });
    ledger.complete(PKG, 'inventory');
    putPlugin('inventory');
    const fake = shellOf('1.0.24', '1.0.25');

    const rows = await installedPlugins({ ledger, shell: fake.shell });

    expect(rows).toEqual([
      { pkg: PKG, name: 'inventory', installed: '1.0.24', latest: '1.0.25' },
    ]);
    expect(fake.commands().some((line) => line.includes(`npm view '${PKG}' version --registry '${REGISTRY}'`))).toBe(
      true,
    );
  });

  it('★ 同一个包问两遍只问一次新版（走 release.ts 那份 TTL 缓存，不新写一个查版本器）', async () => {
    const ledger = rig();
    ledger.intend({ package: PKG, registry: REGISTRY });
    const fake = shellOf('1.0.24', '1.0.25');

    await installedPlugins({ ledger, shell: fake.shell });
    await installedPlugins({ ledger, shell: fake.shell });

    const views = fake.commands().filter((line) => line.startsWith('npm view'));
    const lists = fake.commands().filter((line) => line.startsWith('npm ls'));
    expect(views).toHaveLength(1);
    expect(lists).toHaveLength(2);
  });

  it('强刷才再问一次新版（force 照旧传到 release.ts）', async () => {
    const ledger = rig();
    ledger.intend({ package: PKG, registry: REGISTRY });
    const fake = shellOf('1.0.24', '1.0.25');

    await installedPlugins({ ledger, shell: fake.shell });
    await installedPlugins({ ledger, shell: fake.shell, force: true });

    expect(fake.commands().filter((line) => line.startsWith('npm view'))).toHaveLength(2);
  });

  it('★ 本地目录装的那一笔不问版本（没有源），行上只说它是本地装的', async () => {
    const ledger = rig();
    const at = path.join(root, 'my-plugin');
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(path.join(at, 'opencli-plugin.json'), JSON.stringify({ name: 'mine' }), 'utf8');
    fs.writeFileSync(path.join(at, 'run.js'), 'x', 'utf8');
    ledger.intend({ package: at, local: true });
    const fake = shellOf('1.0.24', '1.0.25');

    const rows = await installedPlugins({ ledger, shell: fake.shell });

    expect(rows).toEqual([{ pkg: at, local: true }]);
    expect(fake.commands()).toEqual([]);
  });

  it('另一份 home 的账不在这段里露面（同一份文件里两处安装互不冒充）', async () => {
    const mine = rig();
    const other = createPluginLedger({ store: createWorkspaceStore({ root }), home: '/tmp/other/home' });
    mine.intend({ package: PKG, registry: REGISTRY });
    other.intend({ package: 'opencli-plugin-other', registry: REGISTRY });
    const fake = shellOf('1.0.24', '1.0.25');

    const rows = await installedPlugins({ ledger: mine, shell: fake.shell });

    expect(rows.map((row) => row.pkg)).toEqual([PKG]);
  });

  it('路由交出去的形状：{ ok, plugins }', async () => {
    const ledger = rig();
    ledger.intend({ package: PKG, registry: REGISTRY });
    const fake = shellOf('1.0.24', '1.0.25');
    const handler = pluginRoutes({ ledger, shell: fake.shell })[INSTALLED_PLUGINS_ROUTE];

    const answer = (await handler?.(new URLSearchParams())) as {
      ok: boolean;
      plugins: readonly { pkg: string }[];
    };

    expect(answer.ok).toBe(true);
    expect(answer.plugins.map((row) => row.pkg)).toEqual([PKG]);
  });

  it('★ 装坏了（目录没了 / 清单解不开 / 没有命令文件）→ 这一行说得出它坏了，不静默当好的', async () => {
    const ledger = rig();
    ledger.intend({ package: PKG, registry: REGISTRY });
    ledger.complete(PKG, 'inventory');
    const fake = shellOf('1.0.24', '1.0.25');

    const [row] = await installedPlugins({ ledger, shell: fake.shell });

    expect(row?.broken).toBe(true);
    expect(row?.name).toBe('inventory');
  });

  it('★ 卸载（台账那一笔去掉）之后这一行就不在这段里了', async () => {
    const ledger = rig();
    ledger.intend({ package: PKG, registry: REGISTRY });
    const fake = shellOf('1.0.24', '1.0.25');
    expect((await installedPlugins({ ledger, shell: fake.shell })).map((row) => row.pkg)).toEqual([PKG]);

    ledger.drop(PKG);

    expect(await installedPlugins({ ledger, shell: fake.shell })).toEqual([]);
  });
});
