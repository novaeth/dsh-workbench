import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import { sessionWorkspace } from '@dsh-workbench/shared/host';
import type { ValueHandoff } from '@dsh-workbench/shared/host';
import { panelsHandoffEntry } from './handoff';
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget, type PanelEntry } from './config';
import type { PanelsService } from './service';
import {
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_LIST_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
} from '../unit';

const MACHINE_LABEL = '机器级默认板 —— 还没配过的工作区默认开这些：';

const MACHINE_CAVEAT = '机器级默认板只是还没配过的工作区的默认值：已经自己配过的工作区保持自己的选择，不会被它改。';

const SCOPE_PARAM = {
  type: 'string',
  description: 'workspace（默认）=只动当前工作区；machine=动机器级默认板（只影响还没配过的工作区）。',
  enum: ['workspace', 'machine'],
};

const ID_PARAM = { type: 'string', description: '模块 id（如 inventory）。' };

function listed(entries: readonly PanelEntry[]): string {
  return entries
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.id} · ${entry.shown ? '已启用' : '未启用'}` +
        `${entry.hasCard ? '' : '（无卡片）'}${entry.source === 'user' ? ' · 用户改过' : ''}`,
    )
    .join('\n');
}

function render(entries: readonly PanelEntry[], workspace: string | null, scope: BoardTarget): string {
  if (scope === 'machine') {
    if (entries.length === 0) return '机器级默认板是空的（还没配过的工作区默认什么卡片都不开）——用 workbench_panels_show 放一个上去。';
    return `${MACHINE_LABEL}\n${listed(entries)}`;
  }
  const where = workspace === null ? '（不知道当前会话在哪个工作区）' : workspace;
  if (entries.length === 0) return `这个工作区的面板是空的（${where}）——用 workbench_panels_show 放一个上去。`;
  return `当前工作区：${where}\n${listed(entries)}`;
}

function parseScope(raw: unknown): BoardTarget {
  if (raw === undefined) return DEFAULT_BOARD_TARGET;
  if (typeof raw === 'string' && BOARD_TARGETS.includes(raw as BoardTarget)) return raw as BoardTarget;
  throw new Error(`不认识的 scope：${String(raw)}（可用：workspace / machine）`);
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    units: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          shown: { type: 'boolean' },
          order: { type: 'integer' },
          hasCard: { type: 'boolean' },
          source: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
};

const OUTPUT = {
  schema: OUTPUT_SCHEMA,
  render: (_args: unknown, value: unknown) => {
    const payload = value as { text?: unknown } | null;
    return [{ type: 'text', text: typeof payload?.text === 'string' ? payload.text : JSON.stringify(value) }];
  },
};

function idOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = (raw as Record<string, unknown>)['id'];
  return typeof value === 'string' ? value : undefined;
}

function scopeOf(raw: unknown): BoardTarget {
  if (typeof raw !== 'object' || raw === null) return parseScope(undefined);
  return parseScope((raw as Record<string, unknown>)['scope']);
}

export function registerPanelTools(
  ctx: DshHostContext,
  panels: PanelsService,
  values?: ValueHandoff,
): Array<() => void> {
  const tools = ctx.get<DshToolRegistry>('tools');
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过户表面板工具注册');
    return [];
  }

  const listTool: DshToolDefinition = {
    name: PANELS_LIST_TOOL,
    description:
      '看现在这份板：哪些套件开着、什么顺序。两份板：本工作区那份优先，没提过的行看机器级默认板 ——' +
      '那只是还没配过的工作区的默认值（自己配过的保持自己的选择）。',
    parameters: {
      type: 'object',
      properties: { scope: SCOPE_PARAM },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const scope = scopeOf(raw);
      const workspace = sessionWorkspace(exec);
      const units = panels.list(workspace, scope);
      if (scope === 'workspace') {
        const entry = panelsHandoffEntry(workspace === null ? {} : { path: workspace });
        if (entry !== undefined) values?.hand(entry, units);
      }
      return { units, text: render(units, workspace, scope) };
    },
  };

  const showTool: DshToolDefinition = {
    name: PANELS_SHOW_TOOL,
    description: '这个工作区要它：之前收起的也放回来，卡片与 agent 工具一起上线；那份板上写过"不要"的也划掉。',
    parameters: {
      type: 'object',
      properties: { id: ID_PARAM, scope: SCOPE_PARAM },
      required: ['id'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const id = idOf(raw);
      const scope = scopeOf(raw);
      const workspace = sessionWorkspace(exec);
      if (id === undefined || id === '') {
        throw new Error(
          `workbench_panels_show 需要一个 id（例如 issues）。当前套件：${panels
            .list(workspace, scope)
            .map((entry) => entry.id)
            .join(', ')}`,
        );
      }
      const units = panels.show(id, workspace, scope);
      const text =
        scope === 'machine'
          ? `已把 ${id} 放进机器级默认板 —— 还没配过的工作区会带上它（卡片与工具一起上线）；那份板上要是给它写过"不要"，这一下也划掉了。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `已启用 ${id} —— 这个工作区要它：之前收起的也放回来了，卡片与工具一起上线。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const hideTool: DshToolDefinition = {
    name: PANELS_HIDE_TOOL,
    description:
      '这个工作区明确不要它：卡片与 agent 工具一起下线（机器板上开着的也照样收起）；别的项目不受影响，' +
      '要放回来用 workbench_panels_show。在机器板上 hide 是写下"不要"这一笔，比名单管用。',
    parameters: {
      type: 'object',
      properties: { id: ID_PARAM, scope: SCOPE_PARAM },
      required: ['id'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const id = idOf(raw);
      const scope = scopeOf(raw);
      const workspace = sessionWorkspace(exec);
      if (id === undefined || id === '') {
        throw new Error(
          `workbench_panels_hide 需要一个 id（例如 issues）。当前套件：${panels
            .list(workspace, scope)
            .map((entry) => entry.id)
            .join(', ')}`,
        );
      }
      const units = panels.hide(id, workspace, scope);
      const text =
        scope === 'machine'
          ? `已把 ${id} 从机器级默认板划掉，并在那份板上明确写下"不要它" —— 还没配过的工作区从此看不到它（卡片与工具一起下线）；名单里还列着它也一样不算数，要放回来用 workbench_panels_show。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `已收起 ${id} —— 这个工作区明确不要它：卡片与工具一起下线（默认在机器上也开着的套件同样收起），别的项目不受影响；要放回来用 workbench_panels_show。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const moveTool: DshToolDefinition = {
    name: PANELS_MOVE_TOOL,
    description: '调顺序：放到最前面（新开一行时排最后）。顺序只属于工作区；机器级默认板上没有顺序一说。',
    parameters: {
      type: 'object',
      properties: {
        id: ID_PARAM,
        index: { type: 'integer', description: '位置，0 基（数的是当前开着的那几行）。' },
        scope: SCOPE_PARAM,
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const id = idOf(raw);
      const scope = scopeOf(raw);
      const workspace = sessionWorkspace(exec);
      if (id === undefined || id === '') {
        throw new Error(
          `workbench_panels_move 需要一个 id（例如 issues）。当前套件：${panels
            .list(workspace, scope)
            .map((entry) => entry.id)
            .join(', ')}`,
        );
      }
      const index = typeof raw === 'object' && raw !== null && typeof (raw as { index?: unknown }).index === 'number'
        ? ((raw as { index: number }).index)
        : 0;
      const units = panels.move(id, index, workspace, scope);
      const text =
        scope === 'machine'
          ? `已把 ${id} 放到机器级默认板第 ${index + 1} 位 —— 只影响还没配过的工作区。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `已把 ${id} 放到第 ${index + 1} 位。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const resetTool: DshToolDefinition = {
    name: PANELS_RESET_TOOL,
    description: '清掉这个工作区改过的行（改完全部回到跟着机器级默认板走）；scope=machine 清的是整份机器级默认板。',
    parameters: {
      type: 'object',
      properties: { scope: SCOPE_PARAM },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const scope = scopeOf(raw);
      const workspace = sessionWorkspace(exec);
      const units = panels.reset(workspace, scope);
      const text =
        scope === 'machine'
          ? `机器级默认板已清空 —— 从今往后，没在这一行改过的工作区默认什么都不开。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `这个工作区改过的行已全部清掉 —— 每一行都回到跟着机器级默认板走。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const followTool: DshToolDefinition = {
    name: PANELS_FOLLOW_TOOL,
    description: '某一行放回跟随机器级默认板（带 id = 只那一行，不带 = 全部）。',
    parameters: {
      type: 'object',
      properties: { id: ID_PARAM, scope: SCOPE_PARAM },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const id = idOf(raw);
      const scope = scopeOf(raw);
      const workspace = sessionWorkspace(exec);
      if (scope === 'machine') {
        throw new Error('机器级默认板没有"放回跟随"一说：它就是那份默认本身，直接 show / hide 写它。');
      }
      const units = panels.follow(workspace, id);
      return {
        units,
        text:
          id === undefined
            ? `这个工作区改过的行全部清掉 —— 每一行都回到跟着机器级默认板走（那份板以后改了，这里跟着变）。\n${render(units, workspace, scope)}`
            : `${id} 放回跟随 —— 它不再由这个工作区定，改跟机器级默认板走。\n${render(units, workspace, scope)}`,
      };
    },
  };

  return [
    tools.register(listTool),
    tools.register(showTool),
    tools.register(hideTool),
    tools.register(moveTool),
    tools.register(resetTool),
    tools.register(followTool),
  ];
}
