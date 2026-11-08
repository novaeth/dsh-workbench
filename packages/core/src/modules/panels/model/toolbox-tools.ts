import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import { sessionIdOf, sessionWorkspace } from '@dsh-workbench/shared/host';
import { TOOLBOX_CLOSE_TOOL, TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL } from '../unit';
import { textOutput } from './tool-output';
import type { PackEntry, PackId, Toolbox } from './toolbox';
import { PACK_TARGET_LIMIT } from './toolbox';

const OUTPUT = textOutput();


const TARGETS_PARAM = {
  type: 'array',
  items: { type: 'string' },
  description: '工具包 id（可多个）：manage / diy / unit:<模块或插件 id>。先 workbench_toolbox_list 看有哪些。',
};

function targetsOf(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const value = (raw as Record<string, unknown>)['targets'];
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : []))
    .slice(0, PACK_TARGET_LIMIT);
}

function presetOf(exec: DshToolRunContext | undefined): string | null {
  const header = exec?.agent?.session?.header as { agentPreset?: unknown } | undefined;
  const value = header?.agentPreset;
  return typeof value === 'string' && value !== '' ? value : null;
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
    '工作台工具包（默认只开三把控制工具；开启工具包要用户审批，关闭工具包不审批）：',
    ...toolbox
      .catalog(workspace)
      .map((pack) => `- ${pack.id} — ${pack.label.zh}（${countLine(pack)}）· ${pack.hint}`),
  ];
  const open = [...toolbox.packsOf(session, preset)];
  lines.push(open.length === 0 ? '现在开着：无' : `现在开着：${open.join('、')}`);
  return lines.join('\n');
}

function unavailableText(): string {
  return '这个 dsh 版本拿不到会话 id，工作台的工具包已经全部可用，直接调需要的工具就行，不用先开启工具包。';
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
  if (targets.length === 0) return { error: `要给 targets（可多个）。${errorText(toolbox, workspace, [])}` };
  const { packs, unknown, hidden } = toolbox.resolve(targets, allowHidden ? undefined : workspace);
  if (unknown.length > 0) return { error: errorText(toolbox, workspace, unknown) };
  if (!allowHidden && hidden.length > 0) return { error: hiddenText(hidden) };
  return { session, packs };
}

function errorText(toolbox: Toolbox, workspace: string | null, unknown: readonly string[]): string {
  const available = toolbox.catalog(workspace).map((pack) => pack.id);
  const named = unknown.length === 0 ? '' : `没有这些工具包：${unknown.join('、')}。`;
  return `${named}可用：${available.join(' / ')}（先调 workbench_toolbox_list 看每个包能干什么）`;
}

function hiddenText(hidden: readonly string[]): string {
  return `没在板子上：${hidden.join('、')} —— 先把模块启用到面板上（workbench_panels_show），再开它的工具包。`;
}

function openedText(toolbox: Toolbox, session: string, preset: string | null, newly: readonly PackId[]): string {
  const catalog = new Map(toolbox.catalog().map((pack) => [pack.id, pack] as const));
  const open = [...toolbox.packsOf(session, preset)];
  const already = open.filter((pack) => !newly.includes(pack));
  const parts = [
    newly.length === 0
      ? '这些工具包本来就在开。'
      : `已开启：${newly.map((pack) => `${pack}（${countLine(catalog.get(pack) as PackEntry)}）`).join('、')}`,
    already.length === 0 ? '' : `本来就在开：${already.join('、')}`,
    '下一次工具调用就能用（不用等用户再发消息）；这一轮用完了就直接调 workbench_toolbox_close 收回去。',
  ];
  return parts.filter((line) => line !== '').join('\n');
}

function closedText(toolbox: Toolbox, session: string, preset: string | null, closed: readonly PackId[]): string {
  const open = [...toolbox.packsOf(session, preset)];
  const parts = [
    closed.length === 0 ? '这些工具包本来就没开。' : `已收起：${closed.join('、')}`,
    open.length === 0 ? '现在没有开着的工具包。' : `仍在开：${open.join('、')}`,
  ];
  return parts.join('\n');
}

export function registerToolboxTools(ctx: DshHostContext, toolbox: Toolbox): Array<() => void> {
  const tools = ctx.get<DshToolRegistry>('tools');
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过工具包控制工具注册');
    return [];
  }

  const listTool: DshToolDefinition = {
    name: TOOLBOX_LIST_TOOL,
    description:
      '列工作台的工具包。默认只挂着三把控制工具，其余能力（面板 / 模块 / 市场 / 调试 / 录制 / 各模块与插件）都收在包里 ——' +
      '用户要用的能力对不上现有工具时，先看这份目录，再开对应的包。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec) ?? null;
      return { text: catalogText(toolbox, session, presetOf(exec), sessionWorkspace(exec) ?? null) };
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
    '开启工作台工具包（manage / diy / unit:<模块或插件 id>），把它的工具解锁到本次会话。' +
      '用户要面板、调试、录制、某个模块或插件的能力时用它；开启要用户审批。',
    false,
    (plan, exec) => {
      const newly = toolbox.open(plan.session, plan.packs, presetOf(exec));
      return {
        packs: [...plan.packs],
        newly: [...newly],
        text: openedText(toolbox, plan.session, presetOf(exec), newly),
      };
    },
  );

  const closeTool = targetTool(
    TOOLBOX_CLOSE_TOOL,
    '收起已开启的工作台工具包，把这些工具从本次会话的上下文里拿掉。用户说"不用了 / 收起来"、或这一轮用完了就调它；不收审批。',
    true,
    (plan, exec) => {
      const closed = toolbox.close(plan.session, plan.packs, presetOf(exec));
      return {
        packs: [...plan.packs],
        closed: [...closed],
        text: closedText(toolbox, plan.session, presetOf(exec), closed),
      };
    },
  );

  return [tools.register(listTool), tools.register(openTool), tools.register(closeTool)];
}
