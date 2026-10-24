import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore, type WorkspaceStore } from '@dsh-workbench/shared/host';
import { isolatedHome } from '@dsh-workbench/adapters-default';
import { APPROVAL_NOTE_ARG, approvalFor } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createFakeOpencli } from './fake-opencli';
import { createPluginCatalog } from '@dsh-workbench/adapters-default';
import { createPluginUnits } from '@dsh-workbench/adapters-default';
import { createUnitRegistry } from '@/kernel/host/unit-registry';
import { pluginPanelId } from '../model/config';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';
import { pluginPanelRefs } from '../model/plugin-panel';
import { createPanelsService } from '../model/service';
import { COMMANDS, deny, harnessOf } from './plugin-tool-units-harness';

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
  ledger = createPluginLedger({ store, home: isolatedHome() });
});

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env['DSH_HOME'];
});

describe('★ 已启用的 opencli 插件：它的命令成为 agent 的工具', () => {
  it('开着 ⇒ 工具在（名字 + schema + 审批标记 + 收窄名单里没有它）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    h.panels.show(pluginPanelId(Inventory), '/w/a');

    const report = await h.manager.refresh();

    expect(report.ok).toBe(true);
    expect([...h.tools.keys()].sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(h.toolOf('inventory_builds')?.description).toBe('构建列表');
    expect(h.toolOf('inventory_builds')?.parameters).toEqual({
      type: 'object',
      properties: { job: { type: 'string', description: '构建配置 ID' } },
      additionalProperties: false,
    });
    expect(h.ownerOf('inventory_build')?.manifest).toMatchObject({
      tools: [
        { name: 'inventory_builds', writes: false },
        { name: 'inventory_build', writes: true },
      ],
    });
    expect(deny(h, '/w/a')).toEqual([]);
  });

  it('★ 关着 ⇒ 工具整套不在工具面上（deny 名单里是它的全部工具）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });

    await h.manager.refresh();

    expect([...h.tools.keys()].sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(deny(h, '/w/a').sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(h.units()).toEqual([pluginPanelId(Inventory)]);
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

  it('★ 两个插件各合成各的（同一份命令面按 site 归属）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    ledger.intend({ package: DEPLOY });
    ledger.complete(DEPLOY, 'deploy');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });

    await h.manager.refresh();

    expect([...h.tools.keys()].sort()).toEqual(['deploy_applications', 'inventory_build', 'inventory_builds']);
    expect([...h.units()].sort()).toEqual([pluginPanelId(DEPLOY), pluginPanelId(Inventory)].sort());
  });

  it('★ 已被已装模块声明过的命令不再合成、而且差额有理由（同一件事不出现两套工具）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({
      store,
      ledger,
      pluginRows: () => PLUGINS,
      declared: new Map([['inventory', new Set(['builds'])]]),
    });

    const report = await h.manager.refresh();

    expect([...h.tools.keys()]).toEqual(['inventory_build']);
    expect(report.plugins.find((row) => row.plugin === 'inventory')?.synthesized).toBe(1);
    expect(report.plugins.find((row) => row.plugin === 'inventory')?.commands).toBe(2);
    expect(report.problems.join('\n')).toContain('由已装模块自己提供（builds）');
  });

  it('工具名撞上已有模块的工具 ⇒ 让位并报出来（不重复注册）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS, moduleTools: ['inventory_builds'] });

    const report = await h.manager.refresh();

    expect([...h.tools.keys()]).toEqual(['inventory_build']);
    expect(report.problems.join('\n')).toContain('inventory_builds');
  });
});

describe('★ 探测拿不到数据：报错，而不是给一份空工具', () => {
  it('plugin list 没跑通 ⇒ ok:false + 点名问题；不注册任何单元', async () => {
    const registry = createUnitRegistry({ declarationOf: () => undefined });
    const panels = createPanelsService({ manifests: () => [], store, owned: () => [], plugins: () => [] });
    const fake = createFakeShell([{ exitCode: 1, stderr: 'opencli: command not found' }]);
    const manager = createPluginUnits({
      registry,
      catalog: createPluginCatalog({ shell: fake.shell, command: 'opencli' }),
      rows: () => panels.listPlugins(null),
      declared: () => new Set<string>(),
      opencliFor: () => createFakeOpencli().opencli,
      toolNames: () => new Set<string>(),
      logger: { info: () => {}, warn: () => {} },
    });
    const report = await manager.refresh();

    expect(report.ok).toBe(false);
    expect(report.problems.join('\n')).toContain('plugin list');
    expect(registry.all()).toEqual([]);
  });

  it('★ 先成功、再探失败 ⇒ 上一份工具面保持（不是悄悄变零工具）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    let broken = false;
    const registry = createUnitRegistry({ declarationOf: () => undefined });
    const panels = createPanelsService({
      manifests: () => registry.manifests(),
      store,
      owned: () => [],
      plugins: () => pluginPanelRefs(ledger),
    });
    const fake = createFakeShell((call) =>
      broken
        ? { exitCode: 1, stderr: 'opencli: 挂了' }
        : call.command.endsWith('plugin list -f json')
          ? { stdout: JSON.stringify(PLUGINS) }
          : { stdout: JSON.stringify(COMMANDS) },
    );
    const manager = createPluginUnits({
      registry,
      catalog: createPluginCatalog({ shell: fake.shell, command: 'opencli' }),
      rows: () => panels.listPlugins(null),
      declared: () => new Set<string>(),
      opencliFor: () => createFakeOpencli().opencli,
      toolNames: () => new Set<string>(),
      logger: { info: () => {}, warn: () => {} },
    });

    const first = await manager.refresh();
    expect(first.ok).toBe(true);
    expect(registry.all().map((host) => host.unit)).toEqual([pluginPanelId(Inventory)]);

    broken = true;
    const second = await manager.refresh();

    expect(second.ok).toBe(false);
    expect(second.problems.join('\n')).toContain('维持在上一份');
    expect(registry.all().map((host) => host.unit)).toEqual([pluginPanelId(Inventory)]);
  });

  it('★ 号上装着、台账里没有（不是从市场装的）⇒ 点出来，也不给工具', async () => {
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });

    const report = await h.manager.refresh();

    expect(h.units()).toEqual([]);
    expect(report.problems.join('\n')).toContain('不在插件台账里');
  });
});

describe('★ 插件版本一变，工具跟着重挂', () => {
  it('命令集变了 ⇒ 旧工具下线、新工具上线（不是两份叠着）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    let commands = ['builds'];
    const h = harnessOf({
      store,
      ledger,
      pluginRows: () => [{ name: 'inventory', version: commands.length === 1 ? '1.0.25' : '1.0.26', commands }],
      commands: COMMANDS,
    });

    await h.manager.refresh();
    expect([...h.tools.keys()]).toEqual(['inventory_builds']);

    commands = ['builds', 'build'];
    await h.manager.refresh();

    expect([...h.tools.keys()].sort()).toEqual(['inventory_build', 'inventory_builds']);
  });
});

describe('★ 审批走既有那条机制（清单里的 writes + 合成单元自己的策略）', () => {
  it('写命令 ⇒ 问（agent 那句附注接在文案末尾）；读命令 ⇒ 不问', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    await h.manager.refresh();

    const write = h.ownerOf('inventory_build');
    const denied = await approvalFor(
      { name: 'inventory_build', arguments: { enterprise: 'tencent' } },
      {
        writes: true,
        policy: write?.needsApproval as never,
      },
    );
    expect(denied?.kind).toBe('ask');
    expect(denied?.kind === 'ask' ? denied.displayReason.zh : '').toBe(
      'agent 想执行工作台 [inventory] opencli 插件的 [build] 命令（enterprise=tencent），允许吗？',
    );

    const note = '把 tencent 预发那条构建发出去';
    const parameters = h.toolOf('inventory_build')?.parameters as {
      properties?: Record<string, unknown>;
      required: string[];
    };
    expect(parameters.required).toContain(APPROVAL_NOTE_ARG);
    expect(parameters.properties !== undefined && APPROVAL_NOTE_ARG in parameters.properties).toBe(true);
    expect([...h.declaredNotes()], '注册那一刻就该把"声明了附注"记上账').toContain('inventory_build');
    expect([...h.declaredNotes()], '读命令没有那一格').not.toContain('inventory_builds');
    const noted = await approvalFor(
      { name: 'inventory_build', arguments: { enterprise: 'tencent', [APPROVAL_NOTE_ARG]: note } },
      {
        writes: true,
        policy: write?.needsApproval as never,
        declaredNote: h.declaredNotes().has('inventory_build'),
      },
    );
    expect(noted?.kind === 'ask' ? noted.displayReason.zh : '').toBe(
      `agent 想执行工作台 [inventory] opencli 插件的 [build] 命令（enterprise=tencent），允许吗？ —— ${note}`,
    );

    const read = h.ownerOf('inventory_builds');
    const asked = await approvalFor(
      { name: 'inventory_builds', arguments: {} },
      { writes: false, policy: read?.needsApproval as never },
    );
    expect(asked).toBeUndefined();
  });
});

describe('★ 触发与生命周期：TTL 之内的 touch 不重复探', () => {
  it('★ touch 一次就探一遍；TTL 之内再 touch 不再探那条命令面', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });

    h.manager.touch();
    await vi.waitFor(() => {
      expect(h.commands().filter((line) => line === 'opencli list -f json').length).toBe(1);
    });

    h.manager.touch();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.commands().filter((line) => line === 'opencli list -f json').length).toBe(1);
  });

  it('★ dispose 把合成单元全摘掉（不留半份工具面）', async () => {
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

describe('★ 工具真的会去调那条命令（argv 与工作区一起交出去）', () => {
  it('读命令：参数翻成 --name=value，工作区当 workdir，模型看到的是那条命令的原样 JSON', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    await h.manager.refresh();

    const value = await h.toolOf('inventory_builds')?.execute(
      { job: 'job-1' },
      { agent: { session: { header: { cwd: '/w/a' } } } } as never,
    );

    expect(h.opencliCalls()).toEqual([
      { args: ['builds', '--job=job-1'], session: 'persistent', workdir: '/w/a' },
    ]);
    expect(value).toEqual({ text: '{"ok":true}' });
  });

  it('★ 那条命令打印什么就收什么：数组 / 标量都不挑形状，输出值一律是对象、text 是命令的原样 JSON', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({
      store,
      ledger,
      pluginRows: () => PLUGINS,
      opencliReplies: [[{ code: 'auth_1' }, { code: 'auth_2' }], 42, 'done'],
    });
    await h.manager.refresh();

    const tool = h.toolOf('inventory_builds');
    const call = () => tool?.execute({}, { agent: { session: { header: { cwd: '/w/a' } } } } as never);

    const rows = await call();
    expect(rows).toEqual({ text: '[{"code":"auth_1"},{"code":"auth_2"}]' });
    expect(tool?.output.render(undefined, rows)).toEqual([
      { type: 'text', text: '[{"code":"auth_1"},{"code":"auth_2"}]' },
    ]);

    expect(await call()).toEqual({ text: '42' });
    expect(await call()).toEqual({ text: '"done"' });
  });
});

describe('★ 站点会话旗标按命令自己的声明走（ADR-0014 §2.2：读复用、写一次性、非浏览器不认它）', () => {
  it('★ 读 persistent、写 ephemeral、browser:false 一个旗标都不带', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    ledger.intend({ package: DEPLOY });
    ledger.complete(DEPLOY, 'deploy');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });
    await h.manager.refresh();

    await h.toolOf('inventory_builds')?.execute({}, {} as never);
    await h.toolOf('inventory_build')?.execute({ enterprise: 'tencent' }, {} as never);
    await h.toolOf('deploy_applications')?.execute({}, {} as never);

    expect(h.opencliCalls().map((call) => call.session)).toEqual(['persistent', 'ephemeral', 'none']);
  });
});

describe('★ 未登录那类错误带上插件给的站点地址（命令面里的 domain 真到手才算数）', () => {
  it('★ domain 是具体域名 ⇒ 文案里给出 https://<域名>/login', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({
      store,
      ledger,
      pluginRows: () => PLUGINS,
      opencliReplies: [new Error('未登录 inventory，请先在浏览器中登录')],
    });
    await h.manager.refresh();

    await expect(h.toolOf('inventory_builds')?.execute({}, {} as never)).rejects.toThrow(
      'https://inventory.example.cn/login',
    );
  });
});

describe('★ 注册期一把坏只废一把（不整批失败、不把已注册的丢在外面）', () => {
  it('★ 其中一把被 dsh 拒 ⇒ 同插件其余照常在，问题记进报告；dispose 后一把不留', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS, failTools: ['inventory_build'] });
    await h.manager.refresh();

    expect([...h.tools.keys()]).toEqual(['inventory_builds']);
    expect(h.manager.report().problems.join('\n')).toContain('inventory_build');
    expect(h.manager.report().problems.join('\n')).toContain('只废这一把');

    h.manager.dispose();

    expect([...h.tools.keys()]).toEqual([]);
  });
});

describe('★ 保留名与合成面预算都点名（不静默）', () => {
  it('★ run_code 是 dsh 保留名 ⇒ 这条不合成，并报出来', async () => {
    ledger.intend({ package: 'opencli-plugin-run' });
    ledger.complete('opencli-plugin-run', 'run');
    const h = harnessOf({
      store,
      ledger,
      pluginRows: () => [{ name: 'run', version: '1.0.0', commands: ['code'] }],
      commands: [
        { site: 'run', name: 'code', description: '跑一段', access: 'read', browser: false, args: [] },
      ],
    });

    const report = await h.manager.refresh();

    expect([...h.tools.keys()]).toEqual([]);
    expect(report.problems.join('\n')).toContain('run_code');
  });

  it('★ 描述+参数说明超预算 ⇒ 报出来、并给出字数（只报，不裁）', async () => {
    ledger.intend({ package: Inventory });
    ledger.complete(Inventory, 'inventory');
    const h = harnessOf({
      store,
      ledger,
      pluginRows: () => [{ name: 'inventory', version: '1.0.25', commands: ['builds'] }],
      commands: [
        {
          site: 'inventory',
          name: 'builds',
          description: '构建列表'.repeat(1_100),
          access: 'read',
          browser: true,
          args: [],
        },
      ],
    });

    const report = await h.manager.refresh();

    expect([...h.tools.keys()]).toEqual(['inventory_builds']);
    expect(report.plugins[0]?.chars).toBeGreaterThan(4_000);
    expect(report.problems.join('\n')).toContain('合成面预算');
  });
});

describe('★ 面板那一行认不出 opencli 名 ⇒ 点名，不猜', () => {
  it('台账记着包名、盘上也读不出插件名 ⇒ 报出来，不给工具', async () => {
    ledger.intend({ package: 'opencli-plugin-mystery' });
    const h = harnessOf({ store, ledger, pluginRows: () => PLUGINS });

    const report = await h.manager.refresh();

    expect(h.units()).toEqual([]);
    expect(report.problems.join('\n')).toContain('认不出它');
  });
});
