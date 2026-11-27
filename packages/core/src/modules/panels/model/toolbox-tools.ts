import { readOnlyToolOf, registerTools } from './tool-registry-guard';
import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import { sessionIdOf, sessionWorkspace } from '@dsh-workbench/shared/host';
import { presetOfSession } from '@/shared/api/host/preset-scope';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { toolScopeContextOf } from '@/shared/api/host/tool-scope';
import { TOOLBOX_CLOSE_TOOL, TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL } from '../unit';
import { textOutput } from './tool-output';
import type { PackId, Toolbox } from './toolbox';
import { PACK_TARGET_LIMIT } from './toolbox';

const OUTPUT = textOutput();

const TARGETS_PARAM = {
  type: 'array',
  items: { type: 'string' },
  description: '工具包 id；可多个。',
};

function targetsOf(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const value = (raw as Record<string, unknown>)['targets'];
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : []))
    .slice(0, PACK_TARGET_LIMIT);
}

function presetOf(ctx: DshHostContext, exec: DshToolRunContext | undefined): string | null {
  return toolScopeContextOf(exec?.agent, (handle) => presetOfSession(ctx, handle))?.preset ?? null;
}

function catalogText(
  toolbox: Toolbox,
  session: string | null,
  preset: string | null,
  workspace: string | null,
): string {
  const lines = [
    '工作台工具包：',
    ...toolbox
      .catalog(workspace)
      .filter((pack) => !(preset === DIY_PRESET_ID && pack.id === 'manage'))
      .map((pack) => (pack.hint === '' ? `- ${pack.id}` : `- ${pack.id} — ${pack.hint}`)),
  ];
  const open = [...toolbox.packsOf(session, preset)];
  lines.push(open.length === 0 ? '当前已启用：无' : `当前已启用：${open.join('、')}`);
  return lines.join('\n');
}

function unavailableText(): string {
  return '这个 dsh 版本读不到会话 id。工作台工具包全部可用，直接调用所需工具，无需先开启。';
}

interface TargetPlan {
  readonly session: string;
  readonly packs: readonly PackId[];
}

function targetPlan(
  raw: unknown,
  exec: DshToolRunContext,
  toolbox: Toolbox,
  allowHidden: boolean,
  preset: string | null,
): TargetPlan | { readonly error: string } {
  const session = sessionIdOf(exec);
  if (session === null) return { error: unavailableText() };
  const workspace = sessionWorkspace(exec) ?? null;
  const targets = targetsOf(raw);
  if (targets.length === 0) return { error: `需要提供 targets（可多个）。${errorText(toolbox, workspace, [])}` };
  const { packs, unknown, hidden } = toolbox.resolve(targets, allowHidden ? undefined : workspace);
  if (unknown.length > 0) return { error: errorText(toolbox, workspace, unknown) };
  if (!allowHidden && hidden.length > 0) return { error: hiddenText(hidden) };
  if (preset === DIY_PRESET_ID && packs.includes('manage')) {
    return {
      error:
        'DIY 模式下不提供 manage 工具包：查看已安装模块、隐藏面板、安装模块、安装模块包、卸载模块、查看或停止长任务，请使用 diy-flow 与 diy-build；' +
        '用 workbench_toolbox_list 查看当前已启用的工具包。',
    };
  }
  return { session, packs };
}

function errorText(toolbox: Toolbox, workspace: string | null, unknown: readonly string[]): string {
  const available = toolbox.catalog(workspace).map((pack) => pack.id);
  const named = unknown.length === 0 ? '' : `没有这些工具包：${unknown.join('、')}。`;
  return `${named}可用：${available.join(' / ')}；先调用 workbench_toolbox_list 查看用途。`;
}

function hiddenText(hidden: readonly string[]): string {
  return `未在面板上：${hidden.join('、')}。先用 workbench_panels_show 把模块启用到面板，再开启它的工具包。`;
}

function openedText(toolbox: Toolbox, session: string, preset: string | null, newly: readonly PackId[]): string {
  const open = [...toolbox.packsOf(session, preset)];
  const already = open.filter((pack) => !newly.includes(pack));
  const parts = [
    newly.length === 0 ? '这些工具包原本已启用。' : `已开启：${newly.join('、')}`,
    already.length === 0 ? '' : `原本已启用：${already.join('、')}`,
    '下一次调用即可使用。相关事项完成或后续不再需要时，调用 workbench_toolbox_close 关闭。',
  ];
  return parts.filter((line) => line !== '').join('\n');
}

function closedText(toolbox: Toolbox, session: string, preset: string | null, closed: readonly PackId[]): string {
  const open = [...toolbox.packsOf(session, preset)];
  const parts = [
    closed.length === 0 ? '这些工具包原本未启用。' : `已关闭：${closed.join('、')}`,
    open.length === 0 ? '当前没有已启用的工具包。' : `仍在启用：${open.join('、')}`,
  ];
  return parts.join('\n');
}

export function registerToolboxTools(ctx: DshHostContext, toolbox: Toolbox): Array<() => void> {
  const listTool = readOnlyToolOf(
    TOOLBOX_LIST_TOOL,
    '列出工作台工具包与当前已启用的包。' + '不确定开哪个包、或已开的包不满足时先调用。',
    OUTPUT,
    async (_raw: unknown, exec: DshToolRunContext) => {
      const session = sessionIdOf(exec) ?? null;
      return { text: catalogText(toolbox, session, presetOf(ctx, exec), sessionWorkspace(exec) ?? null) };
    },
  );

  const targetTool = (
    name: string,
    description: string,
    allowHidden: boolean,
    run: (plan: TargetPlan, exec: DshToolRunContext) => Record<string, unknown>,
  ): DshToolDefinition => ({
    name,
    description,
    parameters: {
      type: 'object',
      properties: { targets: TARGETS_PARAM },
      required: ['targets'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const plan = targetPlan(raw, exec, toolbox, allowHidden, presetOf(ctx, exec));
      if ('error' in plan) return { text: plan.error };
      return run(plan, exec);
    },
  });

  const openTool = targetTool(
    TOOLBOX_OPEN_TOOL,
    '开启工作台工具包。面板 / 模块 / 模块市场 / 长任务用 manage（DIY 模式不提供）；' +
      '工坊流程用 diy-flow（默认），创建与安装用 diy-build，页面用 diy-page，录制用 diy-record；其余用 workbench_toolbox_list 查看；' +
      'MCP server 用 mcp:<server>；模块工具用 unit:<id>。',
    false,
    (plan, exec) => {
      const newly = toolbox.open(plan.session, plan.packs, presetOf(ctx, exec));
      return {
        packs: [...plan.packs],
        newly: [...newly],
        text: openedText(toolbox, plan.session, presetOf(ctx, exec), newly),
      };
    },
  );

  const closeTool = targetTool(
    TOOLBOX_CLOSE_TOOL,
    '关闭工作台工具包，把其中的工具移出本次会话上下文。相关事项完成或后续不再需要时关闭。',
    true,
    (plan, exec) => {
      const closed = toolbox.close(plan.session, plan.packs, presetOf(ctx, exec));
      return {
        packs: [...plan.packs],
        closed: [...closed],
        text: closedText(toolbox, plan.session, presetOf(ctx, exec), closed),
      };
    },
  );

  return registerTools(ctx, '跳过工具包控制工具注册', [listTool, openTool, closeTool]);
}
