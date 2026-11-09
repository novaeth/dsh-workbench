import type { LongTaskBase, LongTaskChange } from '@dsh-workbench/shared/host';
import {
  deliverDebugNotice,
  noticeMessage,
  type AgentsLookup,
  type NoticeDelivery,
  type NoticeMessage,
} from './diy-debug-act';

export const LONG_TASK_NOTICE_KIND = 'workbench-long-task';

export const LONG_TASK_WAIT_NOTICE_KIND = 'workbench-long-task-wait';

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

export interface LongTaskWaitNotice {
  readonly session: string;
  readonly message: NoticeMessage;
  readonly summary: string;
}

export function longTaskWaitNotice(unit: string, change: LongTaskChange<LongTaskBase>): LongTaskWaitNotice | null {
  if (change.kind !== 'step') return null;
  const snapshot = change.snapshot;
  if (snapshot.status !== 'needs-human') return null;
  const intervention = change.step?.intervention;
  if (intervention === undefined) return null;
  const session = snapshot.session;
  if (session === undefined || session === '') return null;
  if (change.by === session) return null;
  const target = snapshot.target;
  const summary = `长任务：${unit} 的「${target}」在等你处理`;
  const text =
    `［长任务 · ${unit}］「${target}」停在「${intervention.title}」—— 要你处理才能继续。` +
    '处理完在界面上按「我处理完了」（模块给了才有），或它自己会继续；' +
    'workbench_long_tasks_list 看当前这几趟。';
  return { session, summary, message: noticeMessage(text, summary, LONG_TASK_WAIT_NOTICE_KIND) };
}

export function createLongTaskWaitNotifier(): (
  agents: AgentsLookup | undefined,
  unit: string,
  change: LongTaskChange<LongTaskBase>,
) => NoticeDelivery | null {
  const seen = new Set<string>();
  return (agents, unit, change) => {
    const notice = longTaskWaitNotice(unit, change);
    if (notice === null) return null;
    const key = `${unit}:${change.snapshot.id}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return deliverDebugNotice(agents, notice.session, notice.message, 'hold');
  };
}
