import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { createHostKit, createWorkspaceStore, type WorkspaceStore } from '@dsh-workbench/shared/host';
import { runtimeLayoutOf } from '@dsh-workbench/shared/host';
import { createNoopDataReader,
} from '@dsh-workbench/shared/testing';
import { pluginPanelId, resolvePluginPanels } from '../model/config';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';
import { pluginPanelRefs } from '../model/plugin-panel';
import { panelRoutes } from '../model/routes';
import { PANELS_MODULE_ID, createPanelsService, type PanelsService } from '../model/service';
import { panelsHost } from '../index';

const Inventory = 'opencli-plugin-inventory';

const roots: string[] = [];

function temp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-plugin-panel-'));
  roots.push(root);
  return root;
}

function pluginOnDisk(home: string, pkg: string, name: string): void {
  const dir = path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'opencli-plugin.json'), JSON.stringify({ name }), 'utf8');
  fs.writeFileSync(path.join(dir, 'list.js'), 'x', 'utf8');
}

let root = '';
let store: WorkspaceStore;
let home = '';
let ledger: PluginLedger;

function panels(): PanelsService {
  return createPanelsService({
    manifests: () => [],
    store,
    plugins: () => pluginPanelRefs(ledger),
  });
}

async function panelsPayload(service: PanelsService, workspace: string): Promise<{
  units: readonly { readonly id: string }[];
  plugins: readonly { readonly id: string; readonly title: string; readonly shown: boolean }[];
  defaults: readonly string[];
}> {
  const routes = panelRoutes(service);
  const payload = (await routes.panels?.(new URLSearchParams({ path: workspace }))) as {
    units: readonly { readonly id: string }[];
    plugins: readonly { readonly id: string; readonly title: string; readonly shown: boolean }[];
    defaults: readonly string[];
  };
  return payload;
}

beforeEach(() => {
  root = temp();
  home = temp();
  process.env['DSH_HOME'] = home;
  store = createWorkspaceStore({ root });
  const layout = runtimeLayoutOf('opencli');
  ledger = createPluginLedger({
    store,
    home: layout.home,
    pluginFiles: { dir: layout.vendorPluginsDir, manifest: 'opencli-plugin.json' },
  });
});

afterEach(() => {
  for (const item of roots.splice(0)) fs.rmSync(item, { recursive: true, force: true });
  delete process.env['DSH_HOME'];
});

describe('台账里已装的插件 ⇒ 面板配置里有一行', () => {
  it('★ 装了一个插件，panels 回包里的 plugins 有它（units 里没有它）', async () => {
    ledger.intend({ package: Inventory, registry: 'https://registry.example' });
    ledger.complete(Inventory, 'inventory');
    const service = panels();

    const payload = await panelsPayload(service, '/w/a');
    const id = pluginPanelId(Inventory);

    expect(payload.plugins.map((plugin) => plugin.id)).toEqual([id]);
    expect(payload.plugins[0]?.title).toBe('inventory');
    expect(payload.plugins[0]?.shown).toBe(false);
    expect(payload.units.some((unit) => unit.id === id)).toBe(false);
  });

  it('★ 台账没记名字就去盘上读一次；读不出来就拿包名兜底', () => {
    pluginOnDisk(home, 'opencli-plugin-notes', 'notes');
    ledger.intend({ package: 'opencli-plugin-notes' });
    ledger.intend({ package: 'opencli-plugin-gone' });

    expect(pluginPanelRefs(ledger)).toEqual([
      { pkg: 'opencli-plugin-notes', title: 'notes', name: 'notes' },
      { pkg: 'opencli-plugin-gone', title: 'opencli-plugin-gone' },
    ]);
  });

  it('★ 行上带着 opencli 插件名：命令面按它归属（名字读不出来就没有这一笔）', () => {
    ledger.intend({ package: 'opencli-plugin-notes' });
    ledger.complete('opencli-plugin-notes', 'notes');

    expect(pluginPanelRefs(ledger)[0]?.name).toBe('notes');
    expect(resolvePluginPanels(pluginPanelRefs(ledger), { workspace: null, machine: null })[0]?.name).toBe(
      'notes',
    );
  });

  it('★ 插件行不参与"板上的排名"（顺序只属于工作区那几行卡片）：那一组按包名排', () => {
    const boards = {
      workspace: { shown: [pluginPanelId(Inventory)], hidden: [] },
      machine: null,
    };
    const entries = resolvePluginPanels(
      [
        { pkg: 'opencli-plugin-aaa', title: 'aaa' },
        { pkg: Inventory, title: 'inventory' },
      ],
      boards,
    );

    expect(entries.map((entry) => entry.pkg)).toEqual(['opencli-plugin-aaa', Inventory]);
    expect(entries[0]?.source).toBe('default');
    expect(entries[1]?.source).toBe('user');
    expect(entries[1]?.shown).toBe(true);
  });
});

describe('插件行的开关：两档都写进板上，面板这一屏的模块行一个字不动', () => {
  it('★ 本工作区打开 ⇒ 本工作区那份板有这一笔；机器板没被动', () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const service = panels();
    const id = pluginPanelId(Inventory);

    service.show(id, '/w/a');

    expect(service.boards('/w/a').workspace?.shown).toContain(id);
    expect(service.boards('/w/a').machine?.shown ?? []).not.toContain(id);
    expect(service.boards('/w/b').workspace).toBeNull();
  });

  it('★ 机器级默认打开 ⇒ 机器板有这一笔；另一个工作区跟着默认看到它', () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const service = panels();
    const id = pluginPanelId(Inventory);

    service.show(id, '/w/a', 'machine');

    expect(service.boards('/w/a').machine?.shown).toContain(id);
    expect(service.boards('/w/a').workspace).toBeNull();
    expect(service.listPlugins('/w/b')[0]?.shown).toBe(true);
    expect(service.listPlugins('/w/b')[0]?.source).toBe('default');
  });

  it('★ 收起与放回跟随都认插件 id（它是"没有卡片"的那种行，照样能开关）', () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const service = panels();
    const id = pluginPanelId(Inventory);

    service.show(id, '/w/a');
    service.hide(id, '/w/a');
    expect(service.boards('/w/a').workspace?.hidden).toContain(id);

    service.follow('/w/a', id);
    expect(service.boards('/w/a').workspace?.shown ?? []).not.toContain(id);
    expect(service.boards('/w/a').workspace?.hidden ?? []).not.toContain(id);
  });

  it('★ 启用插件不让面板多出任何模块行（工具面在合成单元那一侧，见 plugin-tool-units.test.ts）', () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const service = panels();
    const id = pluginPanelId(Inventory);
    const before = service.list('/w/a').map((unit) => unit.id);

    service.show(id, '/w/a');

    expect(service.list('/w/a').map((unit) => unit.id)).toEqual(before);
    expect(service.list('/w/a').some((unit) => unit.hasCard)).toBe(false);
  });
});

function mountHost(manifests: readonly UnitManifest[] = []) {
  const registered: Array<{ readonly name?: string }> = [];
  const ctx = {
    get: (key: string) =>
      key === 'tools'
        ? {
            register(definition: { readonly name?: string }) {
              registered.push(definition);
              return () => {};
            },
          }
        : undefined,
    provide: () => () => {},
    logger: { info: () => {}, warn: () => {} },
  };
  const mounted = panelsHost.mount({
    manifest: panelsHost.manifest,
    ctx: ctx as never,
    manifests: () => manifests,
    ownedUnits: () => [],
    store,
    data: createNoopDataReader(),
    ...createHostKit({ libInstallCommand: (options) => `npm i ${options.need.name}` }),
  });
  const dispose = mounted.registerTools?.() ?? [];
  for (const off of dispose) off();
  return { mounted, registered, dispose };
}

describe('★ 插件只进"面板配置"那一屏，不长卡；给 agent 的工具由合成单元那一侧出', () => {
  it('面板模块自己挂出来的工具与有没有插件逐字相同（插件的工具不走这一份）', () => {
    const clean = mountHost();
    const cleanNames = clean.registered.map((tool) => tool.name);

    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const withPlugin = mountHost();
    const pluginNames = withPlugin.registered.map((tool) => tool.name);

    expect(pluginNames).toEqual(cleanNames);
    expect(pluginNames.every((name) => !String(name).includes(Inventory))).toBe(true);
  });

  it('插件开着也不出现在 units（右栏的卡是按 units 找卡片的，所以根本长不出卡）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const service = panels();
    service.show(pluginPanelId(Inventory), '/w/a');

    const payload = await panelsPayload(service, '/w/a');

    expect(payload.plugins[0]?.shown).toBe(true);
    expect(payload.units).toEqual([]);
  });

  it('机器板那道闸：enable 的写入进 defaults，但 units 仍旧不含插件 id', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const service = panels();
    service.show(pluginPanelId(Inventory), '/w/a', 'machine');

    const payload = await panelsPayload(service, '/w/a');

    expect(payload.defaults).toContain(pluginPanelId(Inventory));
    expect(payload.units).toEqual([]);
  });

  it('released 的插件不在台账的"已装"里 ⇒ 也不上那一行', () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    ledger.release(Inventory);

    expect(pluginPanelRefs(ledger)).toEqual([]);
    expect(panels().listPlugins('/w/a')).toEqual([]);
  });
});

describe('插件 id 不撞模块 id', () => {
  it('模块自己的 id 还是它自己（前缀只加在插件这一侧）', () => {
    expect(pluginPanelId(Inventory)).toBe(`plugin:${Inventory}`);
    expect(PANELS_MODULE_ID).toBe('panels');
  });
});
