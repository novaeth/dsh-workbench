import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import {
  attributeCommands,
  createPluginCatalog,
  parseCommandRows,
  parsePluginRows,
} from '../index.js';

const PLUGINS = [
  { name: 'inventory', version: '1.0.25', commands: ['builds', 'build'] },
  { name: 'deploy', version: '1.0.20', commands: ['applications'] },
];

const COMMANDS = [
  { site: 'inventory', name: 'builds', access: 'read', description: '构建列表' },
  { site: 'inventory', name: 'build', access: 'write', description: '一键构建' },
  { site: 'deploy', name: 'applications', access: 'read', description: '应用列表' },
  { site: '12306', name: 'login', access: 'write', description: '登录' },
];

const json = (value: unknown) => ({ stdout: JSON.stringify(value) });

describe('两份清单的形状（真值以现场为准）', () => {
  it('plugin list：name / version / commands', () => {
    expect(parsePluginRows(JSON.stringify(PLUGINS))).toEqual(PLUGINS);
  });

  it('plugin list：不是数组 / 没有 name ⇒ 读不懂（不冒充"没有插件"）', () => {
    expect(parsePluginRows('No plugins installed')).toBeUndefined();
    expect(parsePluginRows('[{"version":"1.0.0"}]')).toBeUndefined();
    expect(parsePluginRows('[{')).toBeUndefined();
  });

  it('list：site + name + access + args（type/required/default/choices/help）', () => {
    const rows = parseCommandRows(
      JSON.stringify([
        {
          command: 'inventory/build',
          site: 'inventory',
          name: 'build',
          description: '一键构建',
          access: 'write',
          browser: true,
          siteSession: 'persistent',
          args: [
            {
              name: 'enterprise',
              type: 'string',
              required: true,
              positional: false,
              valueRequired: false,
              choices: ['a', 'b'],
              default: null,
              help: '企业 ID',
            },
            { name: 'jobs', type: 'number', required: false, default: 3 },
          ],
        },
      ]),
    );
    expect(rows?.[0]?.site).toBe('inventory');
    expect(rows?.[0]?.access).toBe('write');
    expect(rows?.[0]?.browser).toBe(true);
    expect(rows?.[0]?.siteSession).toBe('persistent');
    expect(rows?.[0]?.args[0]).toEqual({
      name: 'enterprise',
      type: 'string',
      required: true,
      positional: false,
      valueRequired: false,
      choices: ['a', 'b'],
      help: '企业 ID',
    });
    expect(rows?.[0]?.args[1]).toEqual({
      name: 'jobs',
      type: 'number',
      required: false,
      positional: false,
      valueRequired: false,
      choices: [],
      defaultValue: 3,
      help: '',
    });
  });

  it('list：缺 site / name ⇒ 读不懂', () => {
    expect(parseCommandRows('{}')).toBeUndefined();
    expect(parseCommandRows('[{"site":"inventory"}]')).toBeUndefined();
  });
});

describe('★ 一条命令归给哪个插件：join 键是 site === 插件名（实测 5 个插件 91 条命令逐条对得上）', () => {
  it('各归各的，互不串台；命令面里别人的命令不落到这个插件头上', () => {
    const { sets, problems } = attributeCommands(PLUGINS, parseCommandRows(JSON.stringify(COMMANDS)) ?? []);
    expect(problems).toEqual([]);
    expect(sets.map((set) => set.plugin)).toEqual(['inventory', 'deploy']);
    expect(sets[0]?.commands.map((command) => command.name)).toEqual(['builds', 'build']);
    expect(sets[1]?.commands.map((command) => command.name)).toEqual(['applications']);
    expect(sets.flatMap((set) => set.commands).some((command) => command.plugin === '12306')).toBe(false);
  });

  it('插件自称有、命令面里没有 ⇒ 点名报出来，只合成能归属的那些', () => {
    const plugins = [{ name: 'inventory', version: '1.0.0', commands: ['builds', 'gone'] }];
    const { sets, problems } = attributeCommands(plugins, parseCommandRows(JSON.stringify(COMMANDS)) ?? []);
    expect(sets[0]?.commands.map((command) => command.name)).toEqual(['builds']);
    expect(problems.join('\n')).toContain('gone');
  });

  it('插件在、命令面里一条 site 对得上的都没有 ⇒ 归属不了（不是静默零工具）', () => {
    const plugins = [{ name: 'acme-permission', version: '0.1.0', commands: ['page-add'] }];
    const { sets, problems } = attributeCommands(plugins, parseCommandRows(JSON.stringify(COMMANDS)) ?? []);
    expect(sets).toEqual([]);
    expect(problems.join('\n')).toContain('acme-permission');
  });

  it('命令面本身是空的、插件却装着 ⇒ 报出来', () => {
    const { sets, problems } = attributeCommands(PLUGINS, []);
    expect(sets).toEqual([]);
    expect(problems.join('\n')).toContain('一条命令都没有');
  });

  it('★ browser / siteSession / domain 一路带到命令那一层（少一处：会话旗标与登录地址就都是空的）', () => {
    const rows =
      parseCommandRows(
        JSON.stringify([
          {
            site: 'inventory',
            name: 'builds',
            description: '构建列表',
            access: 'read',
            browser: true,
            siteSession: 'ephemeral',
            domain: 'inventory.example.cn',
          },
        ]),
      ) ?? [];
    const { sets } = attributeCommands([{ name: 'inventory', version: '1.0.25', commands: ['builds'] }], rows);

    expect(sets[0]?.commands[0]).toMatchObject({
      browser: true,
      siteSession: 'ephemeral',
      domain: 'inventory.example.cn',
    });
  });
});

function shellOf(plugins: () => unknown, commands: unknown = COMMANDS) {
  return createFakeShell((call) =>
    call.command.endsWith('plugin list -f json') ? json(plugins()) : json(commands),
  );
}

describe('探测：只读、带超时、按插件版本缓存', () => {
  it('★ 探到 ⇒ OK，命令面按插件清单归属', async () => {
    const fake = shellOf(() => PLUGINS);
    const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli' });

    const snapshot = await catalog.refresh();

    expect(snapshot.ok).toBe(true);
    expect(snapshot.sets.map((set) => set.plugin)).toEqual(['inventory', 'deploy']);
    expect(fake.commands()).toEqual(['opencli plugin list -f json', 'opencli list -f json']);
  });

  it('★ 缓存命中：插件清单没变 ⇒ 不再跑那条 1.6MB 的命令面', async () => {
    const fake = shellOf(() => PLUGINS);
    const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli' });

    await catalog.refresh();
    const again = await catalog.refresh();

    expect(again.ok).toBe(true);
    expect(again.sets.map((set) => set.plugin)).toEqual(['inventory', 'deploy']);
    expect(fake.commands()).toEqual(['opencli plugin list -f json', 'opencli list -f json', 'opencli plugin list -f json']);
  });

  it('★ 版本变了 ⇒ 重探命令面（缓存是按插件版本算的）', async () => {
    let version = '1.0.25';
    const fake = shellOf(() => [{ ...PLUGINS[0], version }, PLUGINS[1]]);
    const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli' });

    await catalog.refresh();
    version = '1.0.26';
    const after = await catalog.refresh();

    expect(after.sets[0]?.version).toBe('1.0.26');
    expect(fake.commands().filter((line) => line === 'opencli list -f json').length).toBe(2);
  });

  it('force ⇒ 绕过缓存', async () => {
    const fake = shellOf(() => PLUGINS);
    const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli' });

    await catalog.refresh();
    await catalog.refresh({ force: true });

    expect(fake.commands().filter((line) => line === 'opencli list -f json').length).toBe(2);
  });

  it('★ plugin list 没跑通 ⇒ ok:false 且带原因（不冒充"没有插件"）', async () => {
    const fake = createFakeShell([{ exitCode: 1, stderr: 'opencli: command not found' }]);
    const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli' });

    const snapshot = await catalog.refresh();

    expect(snapshot.ok).toBe(false);
    expect(snapshot.problems.join('\n')).toContain('plugin list');
    expect(snapshot.sets).toEqual([]);
  });

  it('★ 命令面读不懂 ⇒ ok:false（不冒充零工具）', async () => {
    const fake = createFakeShell([json(PLUGINS), { stdout: 'boom' }]);
    const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli' });

    const snapshot = await catalog.refresh();

    expect(snapshot.ok).toBe(false);
    expect(snapshot.problems.join('\n')).toContain('list -f json');
  });

  it('超时也算失败，认得出是超时', async () => {
    const fake = createFakeShell([{ timedOut: true }]);
    const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli', timeoutMs: 1000 });

    expect((await catalog.refresh()).problems.join('\n')).toContain('1 秒');
  });

  it('没有执行缝 ⇒ ok:false，说清是探不动不是没有', async () => {
    const catalog = createPluginCatalog({ command: 'opencli' });
    const snapshot = await catalog.refresh();

    expect(snapshot.ok).toBe(false);
    expect(snapshot.problems.join('\n')).toContain('执行缝');
  });
});
