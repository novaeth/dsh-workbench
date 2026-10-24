import type { LongTaskBase, LongTaskChange } from '@dsh-workbench/shared/host';
import {
  deliverDebugNotice,
  noticeMessage,
  type AgentsLookup,
  type NoticeDelivery,
  type NoticeMessage,
} from './diy-debug-act';

export const LONG_TASK_NOTICE_KIND = 'workbench-long-task';

export interface LongTaskStopNotice {
  readonly session: string;
  readonly message: NoticeMessage;
  readonly summary: string;
}

export function longTaskStopNotice(unit: string, change: LongTaskChange<LongTaskBase>): LongTaskStopNotice | null {
  if (change.kind !== 'settle') return null;
  const snapshot = change.snapshot;
  if (snapshot.status !== 'stopped') return null;
  const session = snapshot.session;
  if (session === undefined || session === '') return null;
  if (change.by === session) return null;
  const target = snapshot.target;
  const summary = `长任务：${unit} 的「${target}」被停了`;
  const who = change.by === undefined ? '用户' : '别的会话';
  const text =
    `［长任务 · ${unit}］「${target}」那一趟被${who}停了 —— 别再把它当"还在跑"；` +
    '要接着做就重新起一趟（workbench_long_tasks_list 看当前这几趟）。';
  return { session, summary, message: noticeMessage(text, summary, LONG_TASK_NOTICE_KIND) };
}

export function notifyLongTaskStop(
  agents: AgentsLookup | undefined,
  unit: string,
  change: LongTaskChange<LongTaskBase>,
): NoticeDelivery | null {
  const notice = longTaskStopNotice(unit, change);
  if (notice === null) return null;
  return deliverDebugNotice(agents, notice.session, notice.message, 'drop');
}
