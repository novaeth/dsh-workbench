import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import { sessionWorkspace } from '@dsh-workbench/shared/host';
import type { ValueHandoff } from '@dsh-workbench/shared/host';
import { panelsHandoffEntry } from './handoff';
import { textOutput } from './tool-output';
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

const MACHINE_LABEL = '机器级默认值（尚未配置过的工作区默认启用以下模块）：';

const MACHINE_CAVEAT = '机器级默认值只影响尚未配置过的工作区；已经配置过的工作区保持自己的选择。';

const SCOPE_PARAM = {
  type: 'string',
  description: 'workspace（默认）修改当前工作区；machine 修改机器级默认值，只影响尚未配置过的工作区。',
  enum: [...BOARD_TARGETS],
};

const ID_PARAM = { type: 'string', description: '模块标识（如 inventory）。' };

function listed(entries: readonly PanelEntry[]): string {
  return entries
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.id} · ${entry.shown ? '已启用' : '未启用'}` +
        `${entry.hasCard ? '' : '（无模块界面）'}${entry.source === 'user' ? ' · 用户改过' : ''}`,
    )
    .join('\n');
}

function render(entries: readonly PanelEntry[], workspace: string | null, scope: BoardTarget): string {
  if (scope === 'machine') {
    if (entries.length === 0) return '机器级默认值为空。尚未配置过的工作区默认不启用任何模块。请用 workbench_panels_show 添加一项。';
    return `${MACHINE_LABEL}\n${listed(entries)}`;
  }
  const where = workspace === null ? '（不知道当前会话在哪个工作区）' : workspace;
  if (entries.length === 0) return `当前工作区的面板为空（${where}）。请用 workbench_panels_show 添加一项。`;
  return `当前工作区：${where}\n${listed(entries)}`;
}

function parseScope(raw: unknown): BoardTarget {
  if (raw === undefined) return DEFAULT_BOARD_TARGET;
  if (typeof raw === 'string' && BOARD_TARGETS.includes(raw as BoardTarget)) return raw as BoardTarget;
  throw new Error(`无法识别的 scope：${String(raw)}（可用值：workspace / machine）`);
}

const panelsOutput = () =>
  textOutput({
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
  });

const OUTPUT = panelsOutput();

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
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过户表面板工具注册');
    return [];
  }

  const listTool: DshToolDefinition = {
    name: PANELS_LIST_TOOL,
    description:
      '查看面板配置：已启用哪些模块、顺序如何。当前工作区的配置优先；未单独配置过的项使用机器级默认值。' +
      '机器级默认值只影响尚未配置过的工作区。',
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
    description: '为当前工作区启用该模块：恢复此前隐藏的项，同时启用模块界面与 agent 工具，并清除机器级默认值中的禁用记录。',
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
          `workbench_panels_show 需要一个 id，例如 issues。当前配置中的模块：${panels
            .list(workspace, scope)
            .map((entry) => entry.id)
            .join(', ')}`,
        );
      }
      const units = panels.show(id, workspace, scope);
      const text =
        scope === 'machine'
          ? `已把 ${id} 写入机器级默认值：尚未配置过的工作区会包含它，模块界面与工具同时启用。若默认值中曾将它标记为"不要"，本次操作已清除该标记。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `已启用 ${id}：当前工作区需要它。此前隐藏的项已恢复，模块界面与工具同时启用。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const hideTool: DshToolDefinition = {
    name: PANELS_HIDE_TOOL,
    description:
      '当前工作区明确不要该模块：模块界面与 agent 工具同时停用，机器级默认值中已启用的模块也同样停用。' +
      '其他项目不受影响，要恢复请用 workbench_panels_show。在机器级默认值上执行 hide 会写入"不要"标记，优先级高于名单。',
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
          `workbench_panels_hide 需要一个 id，例如 issues。当前配置中的模块：${panels
            .list(workspace, scope)
            .map((entry) => entry.id)
            .join(', ')}`,
        );
      }
      const units = panels.hide(id, workspace, scope);
      const text =
        scope === 'machine'
          ? `已把 ${id} 从机器级默认值中清除，并在默认值中标记"不要它"：尚未配置过的工作区从此不再显示它，模块界面与工具同时停用；名单中仍列着它也无效，要恢复请用 workbench_panels_show。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `已停用 ${id}：当前工作区明确不要它，模块界面与工具同时停用；机器级默认值中已启用的模块也同样停用。其他项目不受影响，要恢复请用 workbench_panels_show。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const moveTool: DshToolDefinition = {
    name: PANELS_MOVE_TOOL,
    description: '调整顺序：将模块移到指定位置（默认最前），新启用的行排在最后。顺序仅属于工作区；机器级默认值没有顺序。',
    parameters: {
      type: 'object',
      properties: {
        id: ID_PARAM,
        index: { type: 'integer', description: '位置，从 0 开始计数（按当前已启用的行）。' },
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
          `workbench_panels_move 需要一个 id，例如 issues。当前配置中的模块：${panels
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
          ? `已把 ${id} 放到机器级默认值第 ${index + 1} 位，只影响尚未配置过的工作区。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `已把 ${id} 放到第 ${index + 1} 位。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const resetTool: DshToolDefinition = {
    name: PANELS_RESET_TOOL,
    description: '清除当前工作区修改过的行；清除后全部恢复为跟随机器级默认值。scope=machine 清除整份机器级默认值。',
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
          ? `机器级默认值已清空。此后未修改过的工作区默认不启用任何模块。${MACHINE_CAVEAT}\n${render(units, workspace, scope)}`
          : `当前工作区修改过的行已全部清除，每一行都恢复为跟随机器级默认值。\n${render(units, workspace, scope)}`;
      return { units, text };
    },
  };

  const followTool: DshToolDefinition = {
    name: PANELS_FOLLOW_TOOL,
    description: '让某一行恢复为跟随机器级默认值（带 id 仅限该行，不带则全部）。',
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
        throw new Error('机器级默认值没有"恢复跟随"这一操作：它本身就是默认值，请直接使用 show / hide 写入。');
      }
      const units = panels.follow(workspace, id);
      return {
        units,
        text:
          id === undefined
            ? `当前工作区修改过的行已全部清除，每一行都恢复为跟随机器级默认值。默认值以后修改时，这里随之变化。\n${render(units, workspace, scope)}`
            : `${id} 已恢复跟随：它不再由当前工作区设定，改为跟随机器级默认值。\n${render(units, workspace, scope)}`,
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
