import type { SessionStatusSnapshot, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { isWorkshopPath } from '@/shared/api/diy';
import { attentionSessionIdOf, currentSessionId, sessionRows, type LongTaskPresence } from '@/modules/sessions';

export interface PickProjectInput {
  readonly workspaceId: string;
  readonly items: readonly WorkspaceView[];
  readonly sessions: SessionsSnapshot;
  readonly statusById: SessionStatusSnapshot;
  readonly archivedIds: ReadonlySet<string>;
  readonly longTasks: LongTaskPresence;
  readonly openSession: (sessionId: string) => void;
  readonly startSession: (workspaceId: string) => void;
}

export function openPickedProject(input: PickProjectInput): void {
  const target = input.items.find((item) => item.workspaceId === input.workspaceId) ?? null;
  const picked =
    attentionSessionIdOf({
      workspace: target,
      sessions: input.sessions,
      statusById: input.statusById,
      archivedIds: input.archivedIds,
      longTasks: input.longTasks,
    }) ?? firstSessionIdOf(target, input.sessions, input.archivedIds);
  if (picked === null) input.startSession(input.workspaceId);
  else input.openSession(picked);
}

export function firstSessionIdOf(
  workspace: WorkspaceView | null,
  sessions: SessionsSnapshot,
  archivedIds: ReadonlySet<string>,
): string | null {
  if (workspace === null) return null;
  const current = currentSessionId(sessions, false);
  return sessionRows(workspace.sessionIds, sessions, archivedIds, current)[0]?.id ?? null;
}

export function blankSessionIdOf(
  workspace: WorkspaceView | null,
  sessions: SessionsSnapshot,
  archivedIds: ReadonlySet<string>,
): string | null {
  if (workspace === null) return null;
  for (const id of workspace.sessionIds) {
    if (archivedIds.has(id)) continue;
    const row = sessions.byId[id];
    if (row === undefined || row.origin === 'subagent' || !row.blank) continue;
    return id;
  }
  return null;
}

export interface NewSessionInput {
  readonly workspace: WorkspaceView | null;
  readonly sessions: SessionsSnapshot;
  readonly archivedIds: ReadonlySet<string>;
  readonly openSession: (sessionId: string) => void;
  readonly startSession: (workspaceId: string) => void;
}

export function openNewSession(input: NewSessionInput): void {
  if (input.workspace === null) return;
  if (isWorkshopPath(input.workspace.path)) {
    input.startSession(input.workspace.workspaceId);
    return;
  }
  const blank = blankSessionIdOf(input.workspace, input.sessions, input.archivedIds);
  if (blank === null) input.startSession(input.workspace.workspaceId);
  else input.openSession(blank);
}
