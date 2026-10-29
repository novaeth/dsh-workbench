import type {
  SessionStatusSnapshot,
  SessionSummary,
  SessionsSnapshot,
  Translate,
  WorkspaceView,
} from '@dsh-workbench/shared';
import { sessionNode, sessionRows } from './session-node';

export type AttentionSeverity = 'warning' | 'ongoing' | 'done';

export interface WorkspaceAttention {
  readonly severity: AttentionSeverity;
  readonly count: number;
  readonly longTask?: boolean | undefined;
}

export interface LongTaskPresence {
  readonly bySession: ReadonlySet<string>;
  readonly byWorkspace: ReadonlyMap<string, number>;
}

export function longTaskPresenceOf(
  rows: readonly { readonly workspace: string; readonly session?: string | undefined }[],
): LongTaskPresence {
  const bySession = new Set<string>();
  const byWorkspace = new Map<string, number>();
  for (const row of rows) {
    if (row.session !== undefined) bySession.add(row.session);
    byWorkspace.set(row.workspace, (byWorkspace.get(row.workspace) ?? 0) + 1);
  }
  return { bySession, byWorkspace };
}

export interface Attention {
  readonly byWorkspace: ReadonlyMap<string, WorkspaceAttention>;
  readonly elsewhere: WorkspaceAttention | null;
  readonly overall: WorkspaceAttention | null;
}

export interface AttentionInput {
  readonly workspaces: readonly WorkspaceView[];
  readonly sessions: SessionsSnapshot;
  readonly statusById: SessionStatusSnapshot;
  readonly archivedIds: ReadonlySet<string>;
  readonly currentWorkspaceId: string | null;
  readonly longTasks?: LongTaskPresence | undefined;
}

const RANK: Record<AttentionSeverity, number> = { warning: 2, done: 1, ongoing: 0 };

const LIST_ORDER: Record<AttentionSeverity, number> = { warning: 0, done: 1, ongoing: 2 };

export function attentionListRank(attention: WorkspaceAttention | null | undefined): number {
  return attention === null || attention === undefined ? 3 : LIST_ORDER[attention.severity];
}

const SENTENCES: Record<AttentionSeverity, { readonly one: string; readonly other: string }> = {
  warning: { one: 'project.attention.warning.one', other: 'project.attention.warning.other' },
  ongoing: { one: 'project.attention.running.one', other: 'project.attention.running.other' },
  done: { one: 'project.attention.done.one', other: 'project.attention.done.other' },
};

const WORDS: Record<AttentionSeverity, string> = {
  warning: 'project.attention.state.warning',
  ongoing: 'project.attention.state.running',
  done: 'project.attention.state.done',
};

const NO_IDS: ReadonlySet<string> = new Set();

export function attentionOfSession(
  summary: SessionSummary,
  statusById: SessionStatusSnapshot,
  sessions: SessionsSnapshot,
  longTaskIds: ReadonlySet<string> = NO_IDS,
): AttentionSeverity | undefined {
  const node = sessionNode(summary, statusById, sessions, NO_IDS, NO_IDS, longTaskIds);
  if (node.pendingInteraction !== undefined) return 'warning';
  if (node.running || node.runningSubagentCount > 0 || node.longTask) return 'ongoing';
  if (node.completed) return 'done';
  return undefined;
}

export interface AttentionPickInput {
  readonly workspace: WorkspaceView | null;
  readonly sessions: SessionsSnapshot;
  readonly statusById: SessionStatusSnapshot;
  readonly archivedIds: ReadonlySet<string>;
  readonly longTasks?: LongTaskPresence | undefined;
}

export function attentionSessionIdOf(input: AttentionPickInput): string | null {
  const workspace = input.workspace;
  if (workspace === null) return null;

  let best: SessionSummary | undefined;
  let bestRank = -1;
  for (const summary of sessionRows(workspace.sessionIds, input.sessions, input.archivedIds)) {
    const ofSession = attentionOfSession(summary, input.statusById, input.sessions, input.longTasks?.bySession);
    if (ofSession === undefined) continue;
    const rank = RANK[ofSession];
    if (best === undefined || rank > bestRank || (rank === bestRank && isLater(summary, best))) {
      best = summary;
      bestRank = rank;
    }
  }
  return best?.id ?? null;
}

function isLater(left: SessionSummary, right: SessionSummary): boolean {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt;
  return left.id < right.id;
}

export function attentionOf(input: AttentionInput): Attention {
  const byWorkspace = new Map<string, WorkspaceAttention>();
  let elsewhere: WorkspaceAttention | null = null;
  let overall: WorkspaceAttention | null = null;

  for (const workspace of input.workspaces) {
    let severity: AttentionSeverity | undefined;
    let count = 0;
    let tagged: AttentionSeverity | undefined;
    let taggedCount = 0;

    for (const summary of sessionRows(workspace.sessionIds, input.sessions, input.archivedIds)) {
      const ofSession = attentionOfSession(summary, input.statusById, input.sessions, input.longTasks?.bySession);
      if (ofSession === undefined) continue;

      if (severity === undefined || RANK[ofSession] > RANK[severity]) {
        severity = ofSession;
        count = 1;
      } else if (ofSession === severity) {
        count += 1;
      }

      if (ofSession !== 'ongoing') {
        if (tagged === undefined || RANK[ofSession] > RANK[tagged]) {
          tagged = ofSession;
          taggedCount = 1;
        } else if (ofSession === tagged) {
          taggedCount += 1;
        }
      }
    }

    const longTasks = input.longTasks?.byWorkspace.get(workspace.path) ?? 0;
    if (severity === undefined && longTasks > 0) {
      byWorkspace.set(workspace.workspaceId, { severity: 'ongoing', count: longTasks, longTask: true });
      continue;
    }
    if (severity === undefined) continue;
    byWorkspace.set(workspace.workspaceId, { severity, count });
    if (tagged === undefined) continue;

    const own: WorkspaceAttention = { severity: tagged, count: taggedCount };
    overall = merge(overall, own);
    if (workspace.workspaceId !== input.currentWorkspaceId) elsewhere = merge(elsewhere, own);
  }

  return { byWorkspace, elsewhere, overall };
}

function merge(current: WorkspaceAttention | null, next: WorkspaceAttention): WorkspaceAttention {
  if (current === null || RANK[next.severity] > RANK[current.severity]) return next;
  if (next.severity !== current.severity) return current;
  return { severity: current.severity, count: current.count + next.count };
}

export function attentionLabel(attention: WorkspaceAttention, t: Translate): string {
  if (attention.longTask === true) {
    return t(attention.count === 1 ? 'project.attention.longTask.one' : 'project.attention.longTask.other', {
      n: attention.count,
    });
  }
  const keys = SENTENCES[attention.severity];
  return t(attention.count === 1 ? keys.one : keys.other, { n: attention.count });
}

export function attentionWordLabel(attention: WorkspaceAttention, t: Translate): string {
  return t(WORDS[attention.severity]);
}
