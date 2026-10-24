import { useMemo } from 'react';
import type { SessionStatusSnapshot, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';

import { attentionOf, longTaskPresenceOf, type Attention, type LongTaskPresence } from '@/modules/sessions';
import { useShellLongTasks } from '@/shared/hooks/use-shell-long-tasks';
import { resolveCurrentWorkspace } from './current-workspace';

export interface SidebarAttentionInput {
  readonly items: readonly WorkspaceView[];
  readonly sessions: SessionsSnapshot;
  readonly statusById: SessionStatusSnapshot;
  readonly archived: readonly string[];
  readonly storedId: string | null;
  readonly panelActive: boolean;
  readonly longTasks: LongTaskPresence;
}

export interface SidebarAttentionState {
  readonly current: WorkspaceView | null;
  readonly archivedIds: ReadonlySet<string>;
  readonly attention: Attention;
}

export function useSidebarAttention(input: SidebarAttentionInput): SidebarAttentionState {
  const { items, sessions, statusById, archived, storedId, panelActive, longTasks } = input;
  const archivedIds = useMemo(() => new Set(archived), [archived]);
  const current = resolveCurrentWorkspace({ items, sessions, panelActive, storedId });
  const attention = useMemo(
    () =>
      attentionOf({
        workspaces: items,
        sessions,
        statusById,
        archivedIds,
        currentWorkspaceId: current?.workspaceId ?? null,
        longTasks,
      }),
    [items, sessions, statusById, archivedIds, current, longTasks],
  );

  return { current, archivedIds, attention };
}

export function useLongTaskPresence(): LongTaskPresence {
  const runs = useShellLongTasks();
  return useMemo(() => longTaskPresenceOf(runs), [runs]);
}
