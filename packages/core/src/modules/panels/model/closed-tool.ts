import {
  DIY_STATE_TOOL,
  PANELS_SHOW_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
} from '../unit';
import type { PackEntry } from './toolbox';

export function packClosedReason(tool: string, pack: PackEntry): string {
  return (
    `${tool} 收在 ${pack.id} 工具包里，这次会话没开：调 ${TOOLBOX_OPEN_TOOL}（targets: ["${pack.id}"]）开包` +
    `（要用户审批），开完重调一次；不确定还有哪些包就先 ${TOOLBOX_LIST_TOOL}。`
  );
}

export function offBoardReason(tool: string, unit: string): string {
  return (
    `${tool} 所属的 ${unit} 不在板子上，工具不进上下文：先 ${PANELS_SHOW_TOOL} 把模块启用到面板上，` +
    `再 ${TOOLBOX_OPEN_TOOL} 开它的工具包。`
  );
}

export function absentScreenReason(tool: string): string {
  return (
    `${tool} 在这台 dsh 上不存在：没探到页面调试能力，调试与日志那一族不会出现。` +
    `看页面用 ${DIY_STATE_TOOL} 的 read=<地址>，取证走录制（workbench_diy_record_*）。`
  );
}
