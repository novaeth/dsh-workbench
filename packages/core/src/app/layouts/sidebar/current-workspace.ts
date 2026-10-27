import type { SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';

export interface CurrentWorkspaceInput {
  readonly items: readonly WorkspaceView[];
  readonly sessions: SessionsSnapshot;
  readonly panelActive: boolean;
  readonly storedId: string | null;
}

export function resolveCurrentWorkspace(input: CurrentWorkspaceInput): WorkspaceView | null {
  const ofSession = workspaceOfSession(
    input.items,
    currentSessionId(input.sessions, input.panelActive),
  );
  if (ofSession !== null) return ofSession;
  return input.items.find((item) => item.workspaceId === input.storedId) ?? input.items[0] ?? null;
}
