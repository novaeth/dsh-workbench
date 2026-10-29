import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspaceStore, type WorkspaceStore } from '@dsh-workbench/shared/host';
import { runtimeLayoutOf } from '@dsh-workbench/shared/host';
import { pluginPanelId } from '../model/config';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';
import { harnessOf, deny } from './plugin-tool-units-harness';

const Inventory = 'opencli-plugin-inventory';
const DEPLOY = 'opencli-plugin-deploy';

const PLUGINS = [
  { name: 'inventory', version: '1.0.25', commands: ['builds', 'build'] },
  { name: 'deploy', version: '1.0.20', commands: ['applications'] },
];

const roots: string[] = [];

function temp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-plugin-units-'));
  roots.push(root);
  return root;
}

let root = '';
let store: WorkspaceStore;
let ledger: PluginLedger;

beforeEach(() => {
  root = temp();
  process.env['DSH_HOME'] = temp();
  store = createWorkspaceStore({ root });
  ledger = createPluginLedger({ store, home: runtimeLayoutOf('opencli').home });
});

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env['DSH_HOME'];
});

describe('★ 插件单元挂到工具面上：单元到了就挂、工作区关了就不挂', () => {
  it('开着 ⇒ 工具在，收窄名单里没有它', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    h.panels.show(pluginPanelId(Inventory), '/w/a');

    await h.manager.refresh();

    expect([...h.tools.keys()].sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(h.toolOf('inventory_builds')?.description).toBe('构建列表');
    expect(deny(h, '/w/a')).toEqual([]);
  });

  it('★ 关着 ⇒ 工具整套不在工具面上（deny 名单里是它的全部工具）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });

    await h.manager.refresh();

    expect([...h.tools.keys()].sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(deny(h, '/w/a').sort()).toEqual(['inventory_build', 'inventory_builds']);
  });

  it('★ 机器级默认开着也管用：别的工作区跟着拿到', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    h.panels.show(pluginPanelId(Inventory), '/w/a', 'machine');

    await h.manager.refresh();

    expect(h.panels.listPlugins('/w/b')[0]?.shown).toBe(true);
    expect(deny(h, '/w/b')).toEqual([]);
  });

  it('★ 本工作区关着、机器板开着 ⇒ 这个工作区还是收起来', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    h.panels.show(pluginPanelId(Inventory), '/w/a', 'machine');
    h.panels.hide(pluginPanelId(Inventory), '/w/a');

    await h.manager.refresh();

    expect(deny(h, '/w/a').sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(deny(h, '/w/b')).toEqual([]);
  });

  it('★ 两个插件各是各的（同一份命令面按 site 归属）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    ledger.intend({ package: DEPLOY });
    ledger.complete(DEPLOY, 'deploy');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });

    await h.manager.refresh();

    expect([...h.tools.keys()].sort()).toEqual(['deploy_applications', 'inventory_build', 'inventory_builds']);
    expect([...h.units()].sort()).toEqual([pluginPanelId(DEPLOY), pluginPanelId(Inventory)].sort());
  });

  it('★ 摘掉单元 ⇒ 工具跟着下线（不留半份工具面）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    await h.manager.refresh();
    expect(h.units()).toEqual([pluginPanelId(Inventory)]);

    h.manager.dispose();

    expect(h.units()).toEqual([]);
    expect([...h.tools.keys()]).toEqual([]);
  });
});
