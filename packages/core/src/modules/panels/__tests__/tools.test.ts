import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DshToolDefinition, UnitManifest } from '@dsh-workbench/shared';
import { createValueHandoff, type ValueHandoff } from '@dsh-workbench/shared/host';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import { panelsHandoffEntry } from '../model/handoff';
import { WRITE_TOOLS, panelsUnit } from '../unit';
import { registerPanelTools } from '../model/tools';
import { PANELS_FILE, PANELS_MODULE_ID, createPanelsService } from '../model/service';
import {
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_LIST_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
} from '../unit';

function unit(id: string, order: number): UnitManifest {
  return {
    id,
    titleKey: `${id}.title`, card: { order },
    tools: [],
    host: { inject: [] },
  };
}

const UNITS = [unit('issues', 10), unit('ci', 20)];

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-tool-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const EXEC = { agent: { session: { header: { cwd: '/w/a' } } } };
const A = '/w/a';

function harness(values?: ValueHandoff) {
  const registered: DshToolDefinition[] = [];
  const ctx = {
    get: (key: string) =>
      key === 'tools'
        ? {
            register(definition: DshToolDefinition) {
              registered.push(definition);
              return () => {};
            },
          }
        : undefined,
    logger: { info: () => {}, warn: () => {} },
  };
  const store = createWorkspaceStore({ root: dir });
  const panels = createPanelsService({ manifests: () => UNITS, store });
  const disposers = registerPanelTools(ctx as never, panels, values);
  return { registered, disposers, panels, ctx, store };
}

function toolOf(registered: readonly DshToolDefinition[], name: string): DshToolDefinition {
  const found = registered.find((one) => one.name === name);
  if (found === undefined) throw new Error(`没有注册 ${name}`);
  return found;
}

function parametersOf(tool: DshToolDefinition): {
  properties?: Record<string, { enum?: readonly string[]; description?: string }>;
  required?: readonly string[];
  additionalProperties?: boolean;
} {
  return tool.parameters as never;
}

function machineConfig(store: ReturnType<typeof createWorkspaceStore>): string {
  return path.join(store.machine(PANELS_MODULE_ID).dir, PANELS_FILE);
}

function workspaceConfig(store: ReturnType<typeof createWorkspaceStore>, workspace: string): string {
  return path.join(store.for(PANELS_MODULE_ID, workspace).dir, PANELS_FILE);
}

describe('workbench_panels_*：一个动词一把工具', () => {
  it('★ 每把工具一个动作、都在清单里声明过；附注那一格一个都不加（事实走详情座，附注只留给插件命令族）', () => {
    const { registered, disposers } = harness();

    const declared = new Map(panelsUnit.tools.map((tool) => [tool.name, tool.writes]));
    expect(registered.map((tool) => tool.name).filter((name) => !declared.has(name))).toEqual([]);
    expect(disposers).toHaveLength(registered.length);

    for (const tool of registered) {
      const properties = parametersOf(tool).properties ?? {};
      expect(Object.keys(properties), tool.name).not.toContain('action');
      expect(properties['id']?.description ?? '', tool.name).not.toContain('show / hide / move');
      expect(Object.keys(properties), tool.name).not.toContain('approval_note');
      expect(parametersOf(tool).required ?? [], tool.name).not.toContain('approval_note');
    }
  });

  it('list 给出当前配置与可读文本；只有它不是写', async () => {
    const { registered } = harness();
    const result = (await toolOf(registered, PANELS_LIST_TOOL).execute({}, EXEC)) as {
      text: string;
      units: unknown[];
    };

    expect(result.units).toHaveLength(2);
    expect(result.text).toContain('issues');
    expect(result.text).toContain('未启用');
    expect(panelsUnit.tools.find((tool) => tool.name === PANELS_LIST_TOOL)?.writes).toBe(false);
  });

  it('show / hide 改的是同一份配置（且只动**这个工作区**）', async () => {
    const { registered, panels } = harness();

    await toolOf(registered, PANELS_SHOW_TOOL).execute({ id: 'issues' }, EXEC);
    expect(panels.isEnabled('issues', A)).toBe(true);

    await toolOf(registered, PANELS_HIDE_TOOL).execute({ id: 'issues' }, EXEC);
    expect(panels.isEnabled('issues', A)).toBe(false);
    expect(panels.isEnabled('issues', '/w/b')).toBe(false);
  });

  it('move 调整顺序', async () => {
    const { registered } = harness();
    const result = (await toolOf(registered, PANELS_MOVE_TOOL).execute({ id: 'ci', index: 0 }, EXEC)) as {
      units: Array<{ id: string }>;
    };

    expect(result.units.map((entry) => entry.id)).toEqual(['ci', 'issues']);
  });

  it('reset 把这个工作区清空', async () => {
    const { registered, panels } = harness();
    await toolOf(registered, PANELS_SHOW_TOOL).execute({ id: 'issues' }, EXEC);

    await toolOf(registered, PANELS_RESET_TOOL).execute({}, EXEC);

    expect(panels.list(A).every((entry) => entry.shown === false)).toBe(true);
  });

  it('没给 id 的报错能照做（列出当前套件）', async () => {
    const { registered } = harness();

    await expect(toolOf(registered, PANELS_SHOW_TOOL).execute({}, EXEC)).rejects.toThrow(/issues, ci/);
    await expect(toolOf(registered, PANELS_HIDE_TOOL).execute({}, EXEC)).rejects.toThrow(/workbench_panels_hide/);
    await expect(toolOf(registered, PANELS_MOVE_TOOL).execute({}, EXEC)).rejects.toThrow(/workbench_panels_move/);
  });

  it('没有 tools 服务 → 不注册、不抛错（降级）', () => {
    const ctx = { get: () => undefined, logger: { info: () => {}, warn: () => {} } };
    const panels = createPanelsService({ manifests: () => UNITS, store: createWorkspaceStore({ root: dir }) });

    expect(registerPanelTools(ctx as never, panels)).toEqual([]);
  });
});

describe('读工具把值交给面板', () => {
  it('★ 看配置（list）交出去：面板的模块名单立刻重读，且交的是服务原样那份', async () => {
    const values = createValueHandoff();
    const { registered } = harness(values);

    await toolOf(registered, PANELS_LIST_TOOL).execute({}, EXEC);

    const entry = panelsHandoffEntry({ path: A });
    if (entry === undefined) throw new Error('这个工作区算不出交接键');
    expect(values.take(entry)?.value).toHaveLength(2);
  });

  it('★ scope: machine 的 list 不把机器级板当成当前工作区的值交出去', async () => {
    const values = createValueHandoff();
    const { registered } = harness(values);

    await toolOf(registered, PANELS_LIST_TOOL).execute({ scope: 'machine' }, EXEC);

    const entry = panelsHandoffEntry({ path: A });
    if (entry === undefined) throw new Error('这个工作区算不出交接键');
    expect(values.take(entry)).toBeUndefined();
  });

  it('改配置（show）不交：值交给面板也会被外壳按"写"的口径整块刷掉', async () => {
    const values = createValueHandoff();
    const { registered } = harness(values);

    await toolOf(registered, PANELS_SHOW_TOOL).execute({ id: 'ci' }, EXEC);

    const entry = panelsHandoffEntry({ path: A });
    if (entry === undefined) throw new Error('这个工作区算不出交接键');
    expect(values.take(entry)).toBeUndefined();
  });
});

describe('workbench_panels_*：scope（机器级默认板的写者）', () => {
  it('★ schema：每把工具只带自己的参数；scope 只在 workspace / machine 里选；附注格一个都不加', () => {
    const { registered } = harness();
    const show = parametersOf(toolOf(registered, PANELS_SHOW_TOOL));
    const list = parametersOf(toolOf(registered, PANELS_LIST_TOOL));
    const reset = parametersOf(toolOf(registered, PANELS_RESET_TOOL));

    expect(show.additionalProperties).toBe(false);
    expect(show.required).toEqual(['id']);
    expect(show.properties?.approval_note).toBeUndefined();
    expect(show.properties?.scope?.enum).toEqual(['workspace', 'machine']);
    expect(show.properties?.scope?.description).toContain('还没配过的工作区');
    expect(list.required).toBeUndefined();
    expect(Object.keys(list.properties ?? {})).toEqual(['scope']);
    expect(reset.properties?.index).toBeUndefined();

    const listText = toolOf(registered, PANELS_LIST_TOOL).description;
    expect(listText).toContain('机器级默认板');
    expect(listText).toContain('自己配过的保持自己的选择');
  });

  it('★ scope: machine 的 show / hide / reset 说清"它只是没配过的工作区的默认值"，且都落盘', async () => {
    const { registered, store } = harness();

    const shown = (await toolOf(registered, PANELS_SHOW_TOOL).execute({ id: 'ci', scope: 'machine' }, EXEC)) as {
      text: string;
    };
    expect(shown.text).toContain('还没配过的工作区会带上它');
    expect(shown.text).toContain('机器级默认板只是还没配过的工作区的默认值');
    expect(JSON.parse(fs.readFileSync(machineConfig(store), 'utf8'))).toEqual({ shown: ['ci'], hidden: [] });

    const hidden = (await toolOf(registered, PANELS_HIDE_TOOL).execute({ id: 'ci', scope: 'machine' }, EXEC)) as {
      text: string;
    };
    expect(hidden.text).toContain('还没配过的工作区从此看不到它');
    expect(hidden.text).toContain('名单里还列着它也一样不算数');
    expect(shown.text).toContain('这一下也划掉了');
    expect(JSON.parse(fs.readFileSync(machineConfig(store), 'utf8'))).toEqual({ shown: [], hidden: ['ci'] });

    const cleared = (await toolOf(registered, PANELS_RESET_TOOL).execute({ scope: 'machine' }, EXEC)) as {
      text: string;
    };
    expect(cleared.text).toContain('机器级默认板已清空');
    expect(fs.existsSync(machineConfig(store))).toBe(true);
    expect(JSON.parse(fs.readFileSync(machineConfig(store), 'utf8'))).toEqual({ shown: [], hidden: [] });
  });

  it('★ 机器级默认板没有顺序这一说：move 带 scope: machine 当场报错，两份板一个字都不动', async () => {
    const { registered, panels, store } = harness();

    await toolOf(registered, PANELS_SHOW_TOOL).execute({ id: 'issues', scope: 'machine' }, EXEC);
    await toolOf(registered, PANELS_SHOW_TOOL).execute({ id: 'ci', scope: 'machine' }, EXEC);

    await expect(
      toolOf(registered, PANELS_MOVE_TOOL).execute({ id: 'ci', index: 0, scope: 'machine' }, EXEC),
    ).rejects.toThrow(/机器级默认板没有顺序这一说/);

    expect(JSON.parse(fs.readFileSync(machineConfig(store), 'utf8'))).toEqual({
      shown: ['issues', 'ci'],
      hidden: [],
    });
    expect(panels.list(A, 'machine').filter((entry) => entry.shown).map((entry) => entry.id)).toEqual([
      'issues',
      'ci',
    ]);
    expect(fs.existsSync(workspaceConfig(store, A))).toBe(false);
  });

  it('★ 放回跟随只能在当前工作区做：follow 带 scope: machine 当场报错', async () => {
    const { registered } = harness();

    await expect(
      toolOf(registered, PANELS_FOLLOW_TOOL).execute({ scope: 'machine' }, EXEC),
    ).rejects.toThrow(/机器级默认板没有"放回跟随"一说/);
  });
});

describe('workbench_panels_hide = "这个工作区明确不要它"（B-7）', () => {
  it('★ 工具文本说实话：机器上默认开着的套件也收得掉，show 能放回来，reset 把两边都忘掉', () => {
    const { registered } = harness();
    const hide = toolOf(registered, PANELS_HIDE_TOOL).description;
    const show = toolOf(registered, PANELS_SHOW_TOOL).description;
    const reset = toolOf(registered, PANELS_RESET_TOOL).description;

    expect(hide).toContain('这个工作区明确不要它');
    expect(hide).toContain('机器板上开着的也照样收起');
    expect(hide).toContain('比名单管用');
    expect(show).toContain('之前收起的也放回来');
    expect(show).toContain('那份板上写过"不要"的也划掉');
    expect(reset).toContain('清掉这个工作区改过的行');
  });

  it('★ hide 在当前工作区落 hidden、show 划掉它，并说清"这个工作区不要它"', async () => {
    const { registered, store } = harness();

    const hidden = (await toolOf(registered, PANELS_HIDE_TOOL).execute({ id: 'issues' }, EXEC)) as { text: string };

    expect(hidden.text).toContain('这个工作区明确不要它');
    expect(hidden.text).toContain('默认在机器上也开着的套件同样收起');
    expect(JSON.parse(fs.readFileSync(workspaceConfig(store, A), 'utf8'))).toEqual({ shown: [], hidden: ['issues'] });

    const shown = (await toolOf(registered, PANELS_SHOW_TOOL).execute({ id: 'issues' }, EXEC)) as { text: string };

    expect(shown.text).toContain('之前收起的也放回来了');
    expect(JSON.parse(fs.readFileSync(workspaceConfig(store, A), 'utf8'))).toEqual({
      shown: ['issues'],
      hidden: [],
      order: ['issues'],
    });
  });

  it('★ reset 说清"不再有自己的选择"，落盘两边都是空的', async () => {
    const { registered, store } = harness();
    await toolOf(registered, PANELS_HIDE_TOOL).execute({ id: 'issues' }, EXEC);

    const cleared = (await toolOf(registered, PANELS_RESET_TOOL).execute({}, EXEC)) as { text: string };

    expect(cleared.text).toContain('每一行都回到跟着机器级默认板走');
    expect(JSON.parse(fs.readFileSync(workspaceConfig(store, A), 'utf8'))).toEqual({ shown: [], hidden: [] });
  });

  it('★ 五把写工具都在 WRITE_TOOLS 里（漏一把就是"写了不问"）', () => {
    const { registered } = harness();

    const panelsWriters = panelsUnit.tools
      .filter((tool) => tool.writes && tool.name.startsWith('workbench_panels_'))
      .map((tool) => tool.name);
    expect([...panelsWriters].sort()).toEqual(
      [PANELS_SHOW_TOOL, PANELS_HIDE_TOOL, PANELS_MOVE_TOOL, PANELS_RESET_TOOL, PANELS_FOLLOW_TOOL].sort(),
    );
    for (const name of panelsWriters) expect(WRITE_TOOLS).toContain(name);
    expect(registered.map((tool) => tool.name)).not.toContain('workbench_panels');
  });
});
