import type { ToolboxCapability } from '@dsh-workbench/shared/host';
import { TOOLBOX_CLOSE_TOOL, TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL } from '../unit';
import type { PackEntry } from './toolbox';

const DESCRIPTION_MAX = 500;

function idList(head: string, ids: readonly string[]): string {
  const kept: string[] = [];
  let width = 0;
  for (const [index, id] of ids.entries()) {
    const next = width + (index === 0 ? 0 : ' / '.length) + id.length;
    const rest = ids.length - index - 1;
    const tail = rest === 0 ? '' : ` 等 ${String(ids.length)} 个包`;
    if (head.length + next + tail.length > DESCRIPTION_MAX) break;
    kept.push(id);
    width = next;
  }
  if (kept.length === 0) return `共 ${String(ids.length)} 个包`;
  const rest = ids.length - kept.length;
  return `${kept.join(' / ')}${rest === 0 ? '' : ` 等 ${String(ids.length)} 个包`}`;
}

export function capabilityBriefOf(packs: readonly PackEntry[]): ToolboxCapability {
  const head =
    '用户要的活现有工具干不了、或涉及右侧面板 / 看板 / 卡片、模块 / 市场、页面、录制、日志时看这份。' +
    `工作台的能力按会话收在工具包里，默认不加载：先 ${TOOLBOX_LIST_TOOL} 看目录，` +
    `再 ${TOOLBOX_OPEN_TOOL} 开包（要用户审批）。现在能开的包：`;
  return {
    name: 'workbench-capabilities',
    description: `${head}${idList(head, packs.map((pack) => pack.id))}`,
    content: [
      '工作台的能力按会话收在工具包里，默认一把都不进上下文。',
      '',
      `- 看目录：${TOOLBOX_LIST_TOOL}（每个包的 id、工具数、读 / 写数）。`,
      `- 开包：${TOOLBOX_OPEN_TOOL}，targets 一次可以给多个包 id；开包要用户审批，开完下一步就能调那些工具。`,
      `- 收包：相关的事做完、或接下来用不到，调 ${TOOLBOX_CLOSE_TOOL} 把上下文还回来（不审批）。`,
      '- 四类包：manage（面板 / 模块 / 市场 / 长任务）· diy（工坊 / 页面调试 / 录制 / 日志 / 页面动作）·' +
        ' unit:<模块或插件 id>（每个在板单元一包）· mcp:<server>（dsh 挂的 MCP server）。',
      '- 工作台 DIY 模式（preset workbench-diy）的会话里 manage 与 diy 默认已开：直接调，不用开包。',
      '- 包里写工具照旧逐条审批；MCP 工具自己的审批归 dsh。',
    ].join('\n'),
  };
}
