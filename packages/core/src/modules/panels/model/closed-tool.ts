import {
  DIY_SHOW_TOOL,
  DIY_STATE_TOOL,
  PANELS_SHOW_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
} from '../unit';
import type { PackEntry } from './toolbox';

export function packClosedReason(tool: string, pack: PackEntry): string {
  const summary = pack.hint.replace(/[。；，、]+$/, '');
  const what = summary === '' ? '' : `（${summary}）`;
  return (
    `${tool} 收在 ${pack.id} 工具包里${what}，这次会话没开：调 ${TOOLBOX_OPEN_TOOL}（targets: ["${pack.id}"]）开包，` +
    `开完重调一次；不确定还有哪些包就先 ${TOOLBOX_LIST_TOOL}。`
  );
}

export function diyManageAbsentReason(tool: string): string {
  return (
    `${tool} 在 DIY 会话里不提供：manage 工具包只给普通会话，无法在这里开启，不要尝试开启。` +
    'DIY 会话可用的管理工具分布在 diy-flow 与 diy-build：查看已安装模块、隐藏面板、安装模块、安装模块包、卸载模块、查看或停止长任务。' +
    '更新模块、更换实现、安装或卸载插件、配置模块来源、调整面板顺序，请在普通会话中操作。'
  );
}

export function offBoardReason(tool: string, unit: string, diy = false): string {
  if (diy) {
    return (
      `${tool} 所属的 ${unit} 不在板子上，工具不进上下文：先 ${DIY_SHOW_TOOL} 把模块显示到面板上，` +
      `再重调一次。`
    );
  }
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
