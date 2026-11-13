import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { sessionIdOf, sessionWorkspace } from '@dsh-workbench/shared/host';
import { presetOfSession } from '@/shared/api/host/preset-scope';
import { toolScopeContextOf } from '@/shared/api/host/tool-scope';
import { TOOLBOX_CLOSE_TOOL, TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL } from '../unit';
import { textOutput } from './tool-output';
import type { PackEntry, PackId, Toolbox } from './toolbox';
import { PACK_TARGET_LIMIT } from './toolbox';

const OUTPUT = textOutput();

const TARGETS_PARAM = {
  type: 'array',
  items: { type: 'string' },
  description: '工具包 id：manage / diy / unit:<模块或插件 id> / mcp:<server>',
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

function countLine(pack: PackEntry): string {
  if (pack.kind === 'mcp') return `${pack.tools.length} 把工具`;
  return `${pack.tools.length} 把：读 ${pack.tools.length - pack.writes} / 写 ${pack.writes}`;
}

function catalogText(
  toolbox: Toolbox,
  session: string | null,
  preset: string | null,
  workspace: string | null,
): string {
  const lines = [
    '工作台工具包（默认仅启用三个控制工具；启用工具包需要用户审批，关闭工具包无需审批）：',
    ...toolbox
      .catalog(workspace)
      .map((pack) => `- ${pack.id} — ${pack.label.zh}（${countLine(pack)}）· ${pack.hint}`),
  ];
  const open = [...toolbox.packsOf(session, preset)];
  lines.push(open.length === 0 ? '当前已启用：无' : `当前已启用：${open.join('、')}`);
  return lines.join('\n');
}

function unavailableText(): string {
  return '这个 dsh 版本无法获取会话 id。工作台的工具包已全部可用，直接调用所需工具即可，无需先启用工具包。';
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
): TargetPlan | { readonly error: string } {
  const session = sessionIdOf(exec);
  if (session === null) return { error: unavailableText() };
  const workspace = sessionWorkspace(exec) ?? null;
  const targets = targetsOf(raw);
  if (targets.length === 0) return { error: `需要提供 targets（可多个）。${errorText(toolbox, workspace, [])}` };
  const { packs, unknown, hidden } = toolbox.resolve(targets, allowHidden ? undefined : workspace);
  if (unknown.length > 0) return { error: errorText(toolbox, workspace, unknown) };
  if (!allowHidden && hidden.length > 0) return { error: hiddenText(hidden) };
  return { session, packs };
}

function errorText(toolbox: Toolbox, workspace: string | null, unknown: readonly string[]): string {
  const available = toolbox.catalog(workspace).map((pack) => pack.id);
  const named = unknown.length === 0 ? '' : `没有这些工具包：${unknown.join('、')}。`;
  return `${named}可用：${available.join(' / ')}（先调用 workbench_toolbox_list 查看每个工具包的用途）`;
}

function hiddenText(hidden: readonly string[]): string {
  return `未在面板上：${hidden.join('、')}。请先把模块启用到面板上（workbench_panels_show），再启用它的工具包。`;
}

function openedText(toolbox: Toolbox, session: string, preset: string | null, newly: readonly PackId[]): string {
  const catalog = new Map(toolbox.catalog().map((pack) => [pack.id, pack] as const));
  const open = [...toolbox.packsOf(session, preset)];
  const already = open.filter((pack) => !newly.includes(pack));
  const parts = [
    newly.length === 0
      ? '这些工具包原本已启用。'
      : `已开启：${newly.map((pack) => `${pack}（${countLine(catalog.get(pack) as PackEntry)}）`).join('、')}`,
    already.length === 0 ? '' : `原本已启用：${already.join('、')}`,
    '下一次工具调用即可使用，无需等待用户再次发送消息。相关事项完成后，或后续不再需要时，请调用 workbench_toolbox_close 关闭。',
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
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过工具包控制工具注册');
    return [];
  }

  const listTool: DshToolDefinition = {
    name: TOOLBOX_LIST_TOOL,
    description:
      '列出工作台的工具包目录。默认仅挂载三个控制工具，其余能力收在工具包内；' +
      '不确定调用哪个工具、或现有工具不满足所需能力时，请先调用它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec) ?? null;
      return { text: catalogText(toolbox, session, presetOf(ctx, exec), sessionWorkspace(exec) ?? null) };
    },
  };

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
      const plan = targetPlan(raw, exec, toolbox, allowHidden);
      if ('error' in plan) return { text: plan.error };
      return run(plan, exec);
    },
  });

  const openTool = targetTool(
    TOOLBOX_OPEN_TOOL,
    '开启工作台工具包，将工具解锁到本次会话。' +
      '面板 / 看板 / 模块界面 / 模块市场 启用 manage；调试 / 录制 / 日志 / 页面 启用 diy；' +
      'MCP server 启用 mcp:<server>；模块或插件自己的工具启用 unit:<模块或插件 id>。开启需要用户审批。',
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
    '关闭已开启的工作台工具包，将这些工具从本次会话的上下文中移除。' +
      '相关事项完成后或后续不再需要时请关闭；无需审批。',
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

  return [tools.register(listTool), tools.register(openTool), tools.register(closeTool)];
}
