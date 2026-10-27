import type {
  SessionStatusSnapshot,
  SessionSummary,
  SessionsSnapshot,
  Translate,
} from '@dsh-workbench/shared';

export interface SessionNode {
  readonly id: string;
  readonly title: string;
  readonly blank: boolean;
  readonly running: boolean;
  readonly runningSubagentCount: number;
  readonly longTask: boolean;
  readonly completed: boolean;
  readonly pinned: boolean;
  readonly updatedAt: number;
  readonly pendingInteraction: string | undefined;
}

export interface SessionStatusDot {
  readonly state: 'ongoing' | 'warning' | 'done' | 'idle';
  readonly label: string;
  readonly trailingLabel?: string;
}

export function visiblePendingKind(kind: string | undefined): string | undefined {
  switch (kind) {
    case 'approval':
    case 'plan-review':
    case 'question':
      return kind;
    default:
      return undefined;
  }
}

const NO_IDS: ReadonlySet<string> = new Set();

export function sessionNode(
  summary: SessionSummary,
  statusById: SessionStatusSnapshot,
  list: SessionsSnapshot,
  pinnedIds: ReadonlySet<string>,
  archivedIds: ReadonlySet<string>,
  longTaskIds: ReadonlySet<string> = NO_IDS,
): SessionNode {
  const status = statusById.get(summary.id);
  const catalog = list.projectionsBySession[summary.id]?.values?.subagentCatalog;

  let runningSubagentCount = 0;
  for (const child of catalog ?? []) {
    const childStatus = statusById.get(child.id);
    const childRow = list.byId[child.id];
    const running = childStatus?.running ?? childRow?.running;
    if (running === true) runningSubagentCount += 1;
  }

  return {
    id: summary.id,
    title: summary.blank ? '' : summary.displayTitle,
    blank: summary.blank,
    running: status?.running ?? summary.running,
    runningSubagentCount,
    longTask: longTaskIds.has(summary.id),
    completed: status?.completionUnread === true,
    pinned: !archivedIds.has(summary.id) && pinnedIds.has(summary.id),
    updatedAt: summary.updatedAt,
    pendingInteraction: visiblePendingKind(status?.pendingInteraction?.kind),
  };
}

export function sessionStatuses(node: SessionNode, t: Translate): SessionStatusDot[] {
  const subagents: SessionStatusDot | undefined =
    node.runningSubagentCount > 0
      ? {
          state: 'ongoing',
          label: t(
            node.runningSubagentCount === 1
              ? 'status.subagentsRunning.one'
              : 'status.subagentsRunning.other',
            { n: node.runningSubagentCount },
          ),
        }
      : undefined;

  const longTask: SessionStatusDot = { state: 'ongoing', label: t('status.longTask') };

  let pending: SessionStatusDot | undefined;
  switch (node.pendingInteraction) {
    case 'approval':
      pending = {
        state: 'warning',
        label: t('status.waitingApproval'),
        trailingLabel: t('status.compact.approval'),
      };
      break;
    case 'plan-review':
      pending = {
        state: 'warning',
        label: t('status.planReview'),
        trailingLabel: t('status.compact.planReview'),
      };
      break;
    case 'question':
      pending = {
        state: 'warning',
        label: t('status.waitingAnswer'),
        trailingLabel: t('status.compact.answer'),
      };
      break;
    default:
      pending = undefined;
      break;
  }

  if (pending !== undefined) return subagents === undefined ? [pending] : [pending, subagents];
  if (node.running) {
    const primary: SessionStatusDot = { state: 'ongoing', label: t('status.running') };
    const rest = node.longTask ? [longTask] : [];
    if (subagents === undefined) return [primary, ...rest];
    return [primary, ...rest, subagents];
  }
  if (node.longTask) return subagents === undefined ? [longTask] : [longTask, subagents];
  if (subagents !== undefined) return [subagents];
  if (node.completed) return [{ state: 'done', label: t('status.completed') }];
  return [{ state: 'idle', label: t('status.idle') }];
}

export function currentSessionId(list: SessionsSnapshot, panelActive: boolean): string | undefined {
  if (panelActive) return undefined;
  return Object.values(list.byId).find((session) => (session.retainedBy?.mainView ?? 0) > 0)?.id;
}

export function orderByRecency(rows: readonly SessionSummary[]): SessionSummary[] {
  return [...rows].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    return left.id < right.id ? -1 : 1;
  });
}

export function orderSessionRows(
  rows: readonly SessionSummary[],
  pinnedIds: ReadonlySet<string>,
  archivedIds: ReadonlySet<string>,
): SessionSummary[] {
  const placeholders: SessionSummary[] = [];
  const leading: SessionSummary[] = [];
  const rest: SessionSummary[] = [];
  for (const row of rows) {
    if (row.blank) placeholders.push(row);
    else if (!archivedIds.has(row.id) && pinnedIds.has(row.id)) leading.push(row);
    else rest.push(row);
  }
  return [...placeholders, ...leading, ...rest];
}

export function workspaceOfSession<T extends { readonly sessionIds: readonly string[] }>(
  workspaces: readonly T[],
  sessionId: string | undefined,
): T | null {
  if (sessionId === undefined) return null;
  return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId)) ?? null;
}

export function sessionRows(
  workspaceSessionIds: readonly string[],
  list: SessionsSnapshot,
  archivedIds: ReadonlySet<string>,
  current?: string | undefined,
): SessionSummary[] {
  const rows: SessionSummary[] = [];
  for (const id of workspaceSessionIds) {
    if (archivedIds.has(id)) continue;
    const row = list.byId[id];
    if (row === undefined || row.origin === 'subagent') continue;
    if (row.blank && row.id !== current) continue;
    rows.push(row);
  }
  return orderByRecency(rows);
}
