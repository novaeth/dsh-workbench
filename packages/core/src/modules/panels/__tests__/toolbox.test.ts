import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNoopDataReader } from '@dsh-workbench/shared/testing';
import type { HostContext, UnitManifest } from '@dsh-workbench/shared';
import type { DshToolDefinition } from '@dsh-workbench/shared/host';
import {
  MCP_TOOLS_SERVICE,
  PANELS_SERVICE,
  SESSION_PROJECTIONS_SERVICE,
  TOOLBOX_SERVICE,
  type McpServerPacks,
} from '@dsh-workbench/shared/host';
import { createHostKit, createWorkspaceStore, hostSurface, WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { panelsHost } from '../index';
import { createToolbox, flowPacksOf } from '../model/toolbox';
import type { PanelsService } from '../model/service';
import type { SkillProvider } from '../model/unit-skills';
import {
  DIY_FLOW_TOOLS,
  DIY_PACK_TOOLS,
  DIY_PLAN_TOOL,
  DIY_STEP_TOOL,
  MANAGE_TOOLS,
  MODULES_LIST_TOOL,
  PANELS_SHOW_TOOL,
  TOOLBOX_CLOSE_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
  panelsUnit,
} from '../unit';
import { testAdaptersWith } from './test-adapters';

const boardUnit: UnitManifest = {
  id: 'board-x',
  title: { zh: '看板 X', en: 'Board X' },
  titleKey: 'board.x',
  card: null,
  host: { inject: [], optional: [] },
  tools: [
    { name: 'workbench_board_x_list', writes: false },
    { name: 'workbench_board_x_do', writes: true },
  ],
};

const offUnit: UnitManifest = {
  id: 'off-y',
  title: { zh: '没上板 Y', en: 'Off Y' },
  titleKey: 'off.y',
  card: null,
  host: { inject: [], optional: [] },
  tools: [{ name: 'workbench_off_y_list', writes: false }],
};

const adapters = testAdaptersWith({ root: () => dir, profile: () => profileDir });

let dir = '';
let profileDir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-toolbox-'));
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-toolbox-profile-'));
  fs.writeFileSync(
    path.join(profileDir, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-test', dsh: { profile: { bundles: [] } }, dependencies: {} }),
    'utf8',
  );
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
});

const store = () => createWorkspaceStore({ root: dir });

function mount(
  mcp: readonly McpServerPacks[] = [],
  extra: readonly UnitManifest[] = [],
  presetOf: (session: string) => string | null = () => null,
  skills = true,
) {
  const registered: DshToolDefinition[] = [];
  const warnings: string[] = [];
  const handlers = new Map<string, (payload: unknown) => void>();
  const provided = new Map<string, unknown>();
  const skillRegistry = {
    providers: [] as SkillProvider[],
    invalidations: 0,
    registerProvider(create: (control: { readonly signal: AbortSignal; invalidate(): void }) => SkillProvider) {
      skillRegistry.providers.push(
        create({
          signal: new AbortController().signal,
          invalidate: () => {
            skillRegistry.invalidations += 1;
          },
        }),
      );
      return () => {};
    },
  };
  const ctx = {
    get: (key: string) =>
      key === WORKBENCH_ADAPTERS
        ? adapters
        : key === SESSION_PROJECTIONS_SERVICE
          ? {
              stateOf: (session: unknown) =>
                presetOf(
                  typeof session === 'object' && session !== null
                    ? String((session as { id?: unknown }).id ?? '')
                    : String(session),
                ),
            }
          : key === MCP_TOOLS_SERVICE
            ? { servers: () => mcp }
            : key === TOOLBOX_SERVICE
            ? provided.get(TOOLBOX_SERVICE)
            : key === 'tools'
              ? {
                  register: (definition: DshToolDefinition) => {
                    registered.push(definition);
                    return () => {};
                  },
                }
              : key === 'skills'
                ? skills
                  ? skillRegistry
                  : undefined
                : key === 'workspaceRegistry'
                  ? { list: () => [{ path: dir, title: 'workspace' }] }
                  : undefined,
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
      return () => { handlers.delete(event); };
    },
    provide: (name: string, service: unknown) => {
      provided.set(name, service);
      return () => {};
    },
    logger: { info: () => {}, warn: (message: string) => { warnings.push(message); } },
  } as unknown as HostContext;

  const mounted = panelsHost.mount({
    manifest: panelsUnit,
    ctx,
    logger: { info: () => {}, warn: (message: string) => { warnings.push(message); } },
    manifests: () => [panelsUnit, boardUnit, ...extra],
    ownedUnits: () => [panelsUnit.id, 'board-x'],
    store: store(),
    data: createNoopDataReader(),
    ...createHostKit({ libInstallCommand: (options) => `npm i ${options.need.name}`, surface: hostSurface() }),
  });
  mounted.registerTools();
  return { mounted, registered, handlers, warnings, skillRegistry, provided };
}

const exec = (session?: string) =>
  ({
    agent: {
      ...(session === undefined
        ? {}
        : { session: { id: session, header: { cwd: dir } } }),
    },
  }) as never;

function tool(registered: readonly DshToolDefinition[], name: string): DshToolDefinition {
  const found = registered.find((definition) => definition.name === name);
  if (found === undefined) throw new Error(`没有注册 ${name}`);
  return found;
}

async function call(
  registered: readonly DshToolDefinition[],
  name: string,
  args: unknown,
  session?: string,
): Promise<Record<string, unknown>> {
  return (await tool(registered, name).execute?.(args, exec(session))) as Record<string, unknown>;
}

const deniedOf = (
  mounted: ReturnType<typeof mount>['mounted'],
  session: string | null,
  preset: string | null = null,
): readonly string[] => mounted.gate?.deniedTools({ workspace: dir, preset, session }) ?? [];

const reasonOf = (
  mounted: ReturnType<typeof mount>['mounted'],
  name: string,
  session: string | null,
  preset: string | null = null,
): string | undefined => mounted.gate?.denyReason?.(name, { workspace: dir, preset, session });

describe('工具箱：默认只留控制面，按会话开包', () => {
  it('清单：三个控制工具都在，开包那把不算写', () => {
    const openTool = panelsUnit.tools?.find((one) => one.name === TOOLBOX_OPEN_TOOL);

    expect(panelsUnit.tools?.map((one) => one.name)).toEqual(
      expect.arrayContaining([TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL, TOOLBOX_CLOSE_TOOL]),
    );
    expect(openTool?.writes).toBe(false);
  });

  it('★ 默认会话：manage / 六个 DIY 子包 / 单元包全收着；开一个单元包只放它自己', async () => {
    const { mounted, registered } = mount();
    const all = new Set([...MANAGE_TOOLS, ...DIY_PACK_TOOLS, 'workbench_board_x_list', 'workbench_board_x_do']);

    expect(new Set(deniedOf(mounted, 's-1'))).toEqual(all);
    expect(deniedOf(mounted, 's-1')).not.toContain('workbench_board_x_always');

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['unit:board-x'] }, 's-1');
    const afterUnit = deniedOf(mounted, 's-1');

    expect(afterUnit).not.toContain('workbench_board_x_list');
    expect(afterUnit).toContain(MANAGE_TOOLS[0]);
    expect(afterUnit).toContain(DIY_PACK_TOOLS[0]);
  });

  it('★ 批量开：一次传多个 target，全部生效', async () => {
    const { mounted, registered } = mount();

    const opened = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage', 'unit:board-x'] }, 's-1');

    expect(opened['newly']).toEqual(['manage', 'unit:board-x']);
    const after = deniedOf(mounted, 's-1');
    const managed = new Set<string>([...MANAGE_TOOLS]);
    for (const name of [...MANAGE_TOOLS, 'workbench_board_x_list']) expect(after).not.toContain(name);
    for (const name of DIY_PACK_TOOLS.filter((one) => !managed.has(one))) expect(after).toContain(name);
  });

  it('幂等：再开同一个包不重复问，返回说"本来就在开"', async () => {
    const { registered } = mount();

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');
    const again = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');

    expect(again['newly']).toEqual([]);
    expect(String(again['text'])).toContain('原本已启用');
  });

  it('收包：立刻从清单里收回，不需要审批', async () => {
    const { mounted, registered } = mount();

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');
    const closed = await call(registered, TOOLBOX_CLOSE_TOOL, { targets: ['manage'] }, 's-1');

    expect(closed['closed']).toEqual(['manage']);
    expect(deniedOf(mounted, 's-1')).toContain(MANAGE_TOOLS[0]);
  });

  it('会话隔离：s-1 开了 manage，s-2 还是默认面', async () => {
    const { mounted, registered } = mount();

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');

    expect(deniedOf(mounted, 's-1')).not.toContain(MANAGE_TOOLS[0]);
    expect(deniedOf(mounted, 's-2')).toContain(MANAGE_TOOLS[0]);
  });

  it('DIY 模式只开 diy-flow；判去向之前写文件被拒；显式收掉之后不再默认开回来', async () => {
    const { mounted, registered } = mount();
    const flow = new Set<string>(DIY_FLOW_TOOLS);
    const notBorrowed = MANAGE_TOOLS.filter((one) => one !== MODULES_LIST_TOOL);
    const closedDiy = DIY_PACK_TOOLS.filter((one) => !flow.has(one));

    expect(new Set(deniedOf(mounted, 's-1', 'workbench-diy'))).toEqual(
      new Set([...notBorrowed, ...closedDiy, 'write', 'edit', 'workbench_board_x_list', 'workbench_board_x_do']),
    );
    await call(registered, TOOLBOX_CLOSE_TOOL, { targets: ['diy-flow'] }, 's-1');
    expect(new Set(deniedOf(mounted, 's-1', 'workbench-diy'))).toEqual(
      new Set([...MANAGE_TOOLS, ...DIY_PACK_TOOLS, 'write', 'edit', 'workbench_board_x_list', 'workbench_board_x_do']),
    );
  });

  it('★ 流程步变化会通知 gate；build 步写工具不再被流程闸拒', async () => {
    const { mounted, registered } = mount();
    let changes = 0;
    const off = mounted.gate?.subscribe?.(() => {
      changes += 1;
    });

    await call(registered, DIY_PLAN_TOOL, { destination: 'board', summary: '盯库存' }, 's-1');
    const probing = deniedOf(mounted, 's-1', 'workbench-diy');
    expect(probing).toContain('write');
    expect(probing).not.toContain('workbench_diy_recon');
    expect(probing).toContain('workbench_diy_install');

    await call(registered, DIY_STEP_TOOL, { sites: [] }, 's-1');
    await call(
      registered,
      DIY_PLAN_TOOL,
      { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] },
      's-1',
    );

    const building = deniedOf(mounted, 's-1', 'workbench-diy');
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(building).not.toContain('write');
    expect(building).not.toContain('workbench_diy_install');
    expect(building).not.toContain('workbench_diy_recon');
    expect(building).toContain('workbench_diy_state');
    off?.();
  });

  it('★ 用户先收掉 diy-build：build 步不会被自动开回来，返回点名并给下一步', async () => {
    const { mounted, registered } = mount();

    await call(registered, DIY_PLAN_TOOL, { destination: 'board', summary: '盯库存' }, 's-1');
    await call(registered, TOOLBOX_CLOSE_TOOL, { targets: ['diy-build'] }, 's-1');
    await call(registered, DIY_STEP_TOOL, { sites: [] }, 's-1');
    const planned = await call(
      registered,
      DIY_PLAN_TOOL,
      { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] },
      's-1',
    );

    expect(String(planned['text'])).toContain('diy-build');
    expect(deniedOf(mounted, 's-1', 'workbench-diy')).toContain('workbench_diy_install');
  });

  it('★ 工坊那条会话是先建会话、再 select DIY：header 上没有 preset，list 也要说已启用', async () => {
    const { mounted, registered } = mount([], [], () => 'workbench-diy');

    const listed = await call(registered, TOOLBOX_LIST_TOOL, {}, 's-1');

    expect(String(listed['text'])).toContain('当前已启用：diy-flow');
    expect(String(listed['text'])).not.toContain('manage');
    const flow = new Set<string>(DIY_FLOW_TOOLS);
    const notBorrowed = MANAGE_TOOLS.filter((one) => one !== MODULES_LIST_TOOL);
    const closedDiy = DIY_PACK_TOOLS.filter((one) => !flow.has(one));
    expect(new Set(deniedOf(mounted, 's-1', 'workbench-diy'))).toEqual(
      new Set([...notBorrowed, ...closedDiy, 'write', 'edit', 'workbench_board_x_list', 'workbench_board_x_do']),
    );

    const again = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');
    expect(String(again['text'])).toContain('DIY 模式下不提供 manage 工具包');
  });

  it('★ 自动开包：流程内单调加开，结束只收回自动开的；手动开 / 收优先', () => {
    const box = createToolbox({ manifests: () => [] });
    const preset = 'workbench-diy';

    expect([...box.packsOf('s-1', preset)]).toEqual(['diy-flow']);
    expect(box.autoOpen('s-1', flowPacksOf('probe'))).toEqual(['diy-probe']);
    expect([...box.packsOf('s-1', preset)]).toEqual(['diy-flow', 'diy-probe']);

    box.autoOpen('s-1', flowPacksOf('build'));
    expect([...box.packsOf('s-1', preset)]).toEqual(['diy-flow', 'diy-probe', 'diy-build']);
    expect(box.autoOpen('s-1', flowPacksOf('probe'))).toEqual([]);

    box.open('s-1', ['diy-record'], preset);
    box.clearAuto('s-1');
    expect([...box.packsOf('s-1', preset)]).toEqual(['diy-flow', 'diy-record']);

    box.autoOpen('s-1', flowPacksOf('build'));
    box.close('s-1', ['diy-build'], preset);
    expect(box.autoOpen('s-1', flowPacksOf('build'))).toEqual([]);
    expect(box.packsOf('s-1', preset).has('diy-build')).toBe(false);
  });

  it('★ 旧 dsh 没有会话 id：包全开，开包工具只回一句"不用开"', async () => {
    const { mounted, registered } = mount();

    expect(deniedOf(mounted, null)).toEqual([]);
    const result = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] });
    expect(String(result['text'])).toContain('全部可用');
  });

  it('未知 target：不开任何包，返回合法候选', async () => {
    const { mounted, registered } = mount();

    const result = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['unit:nope'] }, 's-1');

    expect(String(result['text'])).toContain('unit:board-x');
    expect(deniedOf(mounted, 's-1')).toContain(MANAGE_TOOLS[0]);
  });

  it('list 目录：manage + 六个 DIY 子包 + 板子上的单元包，每个一行 id 与一句简介', async () => {
    const { registered } = mount();

    const listed = await call(registered, TOOLBOX_LIST_TOOL, {}, 's-1');
    const text = String(listed['text']);

    expect(text).toContain('manage');
    for (const id of ['diy-flow', 'diy-probe', 'diy-build', 'diy-page', 'diy-debug', 'diy-record']) {
      expect(text).toContain(id);
    }
    expect(text).toContain('unit:board-x');
    expect(text).toContain('面板 · 安装 / 卸载 / 更新模块 · 模块市场 · 长任务');
    expect(text).toContain('创建 / 安装 · 发布 / 显示 / 隐藏 / 长任务');
    expect(text).toContain('board_x_list · board_x_do');
  });

  it('★ 发布模块写在 diy-build 的简介里：agent 只看得到这一行，不能让它猜（2026-11-23 补上）', async () => {
    const { registered } = mount();

    const text = String((await call(registered, TOOLBOX_LIST_TOOL, {}, 's-1'))['text']);

    expect(text).toMatch(/^- diy-build — .*发布/m);
    expect(text).toMatch(/^- manage — .*安装 \/ 卸载 \/ 更新模块/m);
  });

  it('★ 单元包的简介取模块自己的 description；没写才退回工具名', () => {
    const described = createToolbox({
      manifests: () => [{ ...boardUnit, description: '看本月的任务和状态。' }],
    });
    expect(described.catalog().find((pack) => pack.id === 'unit:board-x')?.hint).toBe('看本月的任务和状态。');

    const fallback = createToolbox({ manifests: () => [boardUnit] });
    expect(fallback.catalog().find((pack) => pack.id === 'unit:board-x')?.hint).toBe('board_x_list · board_x_do');
  });
});

describe('收起的工具：拒绝理由指回包与下一步', () => {
  it('★ 默认会话：被收起的写工具点名包 + 开包工具（不再弹一张白点的审批屏）', () => {
    const { mounted } = mount();

    const reason = reasonOf(mounted, 'workbench_panels_show', 's-1');

    expect(reason).toContain('manage');
    expect(reason).toContain(TOOLBOX_OPEN_TOOL);
    expect(reason).toContain('workbench_panels_show');
  });

  it('单元包收着时点名 unit:<模块 id>', () => {
    const { mounted } = mount();

    expect(reasonOf(mounted, 'workbench_board_x_do', 's-1')).toContain('unit:board-x');
  });

  it('开包之后不再给理由', async () => {
    const { mounted, registered } = mount();

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage', 'unit:board-x'] }, 's-1');

    expect(reasonOf(mounted, 'workbench_panels_show', 's-1')).toBeUndefined();
    expect(reasonOf(mounted, 'workbench_board_x_do', 's-1')).toBeUndefined();
  });

  it('★ MCP 收着时点名 mcp:<server>；开了就没了', async () => {
    const { mounted, registered } = mount([{ name: 'chrome', tools: ['mcp__chrome__list_pages'] }]);

    expect(reasonOf(mounted, 'mcp__chrome__list_pages', 's-1')).toContain('mcp:chrome');

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['mcp:chrome'] }, 's-1');
    expect(reasonOf(mounted, 'mcp__chrome__list_pages', 's-1')).toBeUndefined();
  });

  it('没上板的单元：说的是先上板，不是先开包', () => {
    const { mounted } = mount([], [offUnit]);

    const reason = reasonOf(mounted, 'workbench_off_y_list', 's-1');

    expect(reason).toContain('off-y');
    expect(reason).toContain(PANELS_SHOW_TOOL);
  });

  it('不是工作台的名字：不接这个锅（别人的 unknown tool 照旧）', () => {
    const { mounted } = mount();

    expect(reasonOf(mounted, 'bash', 's-1')).toBeUndefined();
    expect(reasonOf(mounted, 'team_task_get', 's-1')).toBeUndefined();
  });

  it('模块的工具都在包里：没开包就是被收起；控制工具自己不算', () => {
    const { mounted } = mount();

    expect(reasonOf(mounted, 'workbench_board_x_list', 's-1')).toContain('unit:board-x');
    for (const name of [TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL, TOOLBOX_CLOSE_TOOL]) {
      expect(reasonOf(mounted, name, 's-1')).toBeUndefined();
    }
  });

  it('旧 dsh 没有会话 id：包全开，不给理由', () => {
    const { mounted } = mount();

    expect(reasonOf(mounted, MANAGE_TOOLS[0], null)).toBeUndefined();
  });
});

describe('MCP server 也是外部包', () => {
  const servers: readonly McpServerPacks[] = [
    { name: 'chrome', tools: ['mcp__chrome__navigate_page', 'mcp__chrome__take_snapshot'] },
  ];

  it('★ 目录里列 mcp:<server>，默认 deny 掉它的工具', async () => {
    const { mounted, registered } = mount(servers);
    const listed = await call(registered, TOOLBOX_LIST_TOOL, {}, 's-1');

    expect(String(listed['text'])).toContain('- mcp:chrome\n');
    expect(deniedOf(mounted, 's-1')).toContain('mcp__chrome__navigate_page');
  });

  it('★ 开 mcp 包：它的工具从 deny 里消失；旧的没有会话 id 时照旧全开', async () => {
    const { mounted, registered } = mount(servers);

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['mcp:chrome'] }, 's-1');

    expect(deniedOf(mounted, 's-1')).not.toContain('mcp__chrome__navigate_page');
    expect(deniedOf(mounted, null)).toEqual([]);
  });
});

const emptyUnit: UnitManifest = {
  id: 'empty-unit',
  title: { zh: '空', en: 'Empty' },
  titleKey: 'empty.unit',
  card: null,
  host: { inject: [], optional: [] },
  tools: [],
};

function providerOf(skillRegistry: { readonly providers: readonly SkillProvider[] }): SkillProvider {
  const provider = skillRegistry.providers[0];
  if (provider === undefined) throw new Error('没有注册 skill provider');
  return provider;
}

describe('模块 skill：/workbench-<unit-id> 只列当前工作区可用、仅用户调用', () => {
  it('注册一个 user-only skill provider', () => {
    const { skillRegistry } = mount();
    expect(providerOf(skillRegistry).name).toBe('workbench');
  });

  it('只给当前工作区可见、有工具的单元；panels、无工具、未启用都没有', async () => {
    const { skillRegistry } = mount([], [offUnit, emptyUnit]);
    const skills = await providerOf(skillRegistry).list({ cwd: dir });

    expect(skills.map((one) => one.name)).toEqual(['workbench-board-x']);
    expect(skills[0]?.description).toBe('看板 X');
    expect(skills[0]?.invocation).toEqual({ modelInvocable: false, userInvocable: true });
    expect(skills[0]?.source).toBe('custom');
    expect(skills[0]?.provider).toBe('workbench');
    expect(skills[0]?.locator).toBe('board-x');
  });

  it('没有项目：没有 skill', async () => {
    const { skillRegistry } = mount();
    const provider = providerOf(skillRegistry);
    expect(await provider.list({})).toEqual([]);
    expect(await provider.list({ cwd: path.join(os.tmpdir(), 'not-registered') })).toEqual([]);
  });

  it('正文只点名模块和工具包，不点名具体工具', async () => {
    const { skillRegistry } = mount();
    const provider = providerOf(skillRegistry);
    const candidates = await provider.list({ cwd: dir });
    const candidate = candidates[0];
    if (candidate === undefined) throw new Error('没有 skill');
    const skill = await provider.get(candidate, { cwd: dir });

    expect(skill?.content).toContain('看板 X');
    expect(skill?.content).toContain('unit:board-x');
    expect(skill?.content).not.toContain('workbench_board_x_list');
  });

  it('面板变化会让 skill 目录失效', () => {
    const { skillRegistry, provided } = mount();
    const panels = provided.get(PANELS_SERVICE) as PanelsService | undefined;

    expect(skillRegistry.invalidations).toBe(0);
    panels?.reset(dir);
    expect(skillRegistry.invalidations).toBe(1);
  });

  it('skills 服务缺失：不炸，也不注册', () => {
    const { skillRegistry } = mount([], [], () => null, false);
    expect(skillRegistry.providers).toEqual([]);
  });
});
