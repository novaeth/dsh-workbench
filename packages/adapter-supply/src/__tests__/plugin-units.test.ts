import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createPluginCatalog } from '../plugin-catalog.js';
import { createPluginUnits } from '../plugin-units.js';
import type { UnitRegistry } from '../unit-registry-types.js';

const COMMANDS = [
  {
    site: 'inventory',
    name: 'builds',
    description: '构建列表',
    access: 'read',
    browser: true,
    siteSession: 'persistent',
    domain: 'inventory.example.cn',
    args: [{ name: 'job', type: 'string', required: false, help: '构建配置 ID' }],
  },
  {
    site: 'inventory',
    name: 'build',
    description: 'Inventory 一键构建',
    access: 'write',
    browser: true,
    args: [{ name: 'enterprise', type: 'string', required: true, help: '企业 ID' }],
  },
  {
    site: 'deploy',
    name: 'applications',
    description: '应用列表',
    access: 'read',
    browser: false,
    args: [],
  },
];

type Face = {
  unit: string;
  manifest: { id: string; tools: readonly { name: string; writes: boolean; opencli: { plugin: string; command: string; args: readonly string[] } }[] };
  mount(deps: unknown): { registerTools?: () => readonly unknown[]; routes?: unknown };
};

function registryOf(): { registry: UnitRegistry; faces: Face[]; tools: Map<string, unknown> } {
  const faces: Face[] = [];
  const tools = new Map<string, unknown>();
  const registry: UnitRegistry = {
    all: () => faces,
    registerPlugin: (face) => {
      faces.push(face as Face);
      return () => {};
    },
  };
  return { registry, faces, tools };
}

function unitsOf(options: {
  plugins: readonly { name: string; version: string; commands: readonly string[] }[];
  declared?: ReadonlyMap<string, ReadonlySet<string>>;
  moduleTools?: readonly string[];
  catalogBroken?: boolean;
  commands?: unknown;
}) {
  const { registry, faces, tools } = registryOf();
  const shell = createFakeShell([
    { stdout: JSON.stringify(options.plugins) },
    options.catalogBroken === true ? { exitCode: 1, stderr: 'boom' } : { stdout: JSON.stringify(options.commands ?? COMMANDS) },
  ]);
  const problems: string[] = [];
  const manager = createPluginUnits({
    registry,
    catalog: createPluginCatalog({ shell: shell.shell, command: 'opencli' }),
    rows: () => options.plugins.map((plugin) => ({ id: `plugin:opencli-plugin-${plugin.name}`, pkg: `opencli-plugin-${plugin.name}`, name: plugin.name })),
    declared: (plugin) => options.declared?.get(plugin) ?? new Set<string>(),
    opencliFor: () => ({ json: async () => ({ value: {}, at: 0 }) }) as never,
    toolNames: () => new Set(options.moduleTools ?? []),
    logger: { info: () => {}, warn: (message: string) => problems.push(message) },
  });
  return { manager, faces, tools, problems, registry };
}

describe('插件命令合成为工具：协议要求的那几条行为', () => {
  it('开着 → 每个命令一个工具，名字、描述、参数、writes 都对', async () => {
    const { manager, faces } = unitsOf({ plugins: [{ name: 'inventory', version: '1.0.25', commands: ['builds', 'build'] }] });

    const report = await manager.refresh();

    expect(report.ok).toBe(true);
    expect(faces).toHaveLength(1);
    const manifest = faces[0]?.manifest;
    expect(manifest?.id).toBe('plugin:opencli-plugin-inventory');
    expect(manifest?.tools.map((tool) => tool.name).sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(manifest?.tools.find((tool) => tool.name === 'inventory_build')?.writes).toBe(true);
    expect(manifest?.tools.find((tool) => tool.name === 'inventory_builds')?.writes).toBe(false);
    expect(manifest?.tools.find((tool) => tool.name === 'inventory_build')?.opencli).toEqual({
      plugin: 'inventory',
      command: 'build',
      args: ['enterprise'],
    });
  });

  it('已装模块声明过的命令不再合成，而且差额有理由', async () => {
    const { manager, faces, problems } = unitsOf({
      plugins: [{ name: 'inventory', version: '1.0.25', commands: ['builds', 'build'] }],
      declared: new Map([['inventory', new Set(['builds'])]]),
    });

    await manager.refresh();

    expect(faces[0]?.manifest.tools.map((tool) => tool.name)).toEqual(['inventory_build']);
    expect(problems.join('\n')).toContain('builds');
  });

  it('工具名撞上已有模块的工具 ⇒ 让位并报出来', async () => {
    const { manager, faces, problems } = unitsOf({
      plugins: [{ name: 'inventory', version: '1.0.25', commands: ['builds', 'build'] }],
      moduleTools: ['inventory_build'],
    });

    await manager.refresh();

    expect(faces[0]?.manifest.tools.map((tool) => tool.name)).toEqual(['inventory_builds']);
    expect(problems.join('\n')).toContain('inventory_build');
  });

  it('命令面读不到 ⇒ 不注册任何单元，报告说清问题', async () => {
    const { manager, faces } = unitsOf({
      plugins: [{ name: 'inventory', version: '1.0.25', commands: ['builds'] }],
      catalogBroken: true,
    });

    const report = await manager.refresh();

    expect(report.ok).toBe(false);
    expect(faces).toHaveLength(0);
    expect(report.problems.length).toBeGreaterThan(0);
  });
});

describe('报告与保留名', () => {
  it('报告里照实说：这个插件几条命令、合成了几把、占多少字、工具名是什么', async () => {
    const { manager } = unitsOf({ plugins: [{ name: 'inventory', version: '1.0.25', commands: ['builds', 'build'] }] });

    const report = await manager.refresh();

    const row = report.plugins.find((item) => item.plugin === 'inventory');
    expect(row?.commands).toBe(2);
    expect(row?.synthesized).toBe(2);
    expect(row?.tools).toEqual(['inventory_builds', 'inventory_build']);
  });

  it('run_code 是保留名 ⇒ 这条不合成，并报出来', async () => {
    const { manager, faces, problems } = unitsOf({
      plugins: [{ name: 'run', version: '1.0.0', commands: ['code'] }],
      commands: [{ site: 'run', name: 'code', description: '跑一段', access: 'read', browser: false, args: [] }],
    });

    await manager.refresh();

    expect(faces.every((face) => face.manifest.tools.every((tool) => tool.name !== 'run_code'))).toBe(true);
    expect(problems.join('\n')).toContain('run_code');
  });
});
