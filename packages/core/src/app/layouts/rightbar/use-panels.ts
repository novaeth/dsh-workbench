import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@dsh-workbench/shared';

import { useFactRevision } from '@/shared/hooks/use-facts';
import type { SessionsSnapshot, WorkspaceSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';
import { selectedProjectId, subscribeProject } from '@/app/layouts/project-selection';
import { useRuntimeSidebarEdition } from '@/app/layouts/sidebar/edition';

export interface PanelUnit {
  readonly id: string;
  readonly titleKey: string;
  readonly shown: boolean;
  readonly source: 'default' | 'user';
  readonly hasCard: boolean;
}

export interface PanelPluginUnit {
  readonly id: string;
  readonly pkg: string;
  readonly title: string;
  readonly shown: boolean;
  readonly source: 'default' | 'user';
}

export interface PanelBoardView {
  readonly units: readonly PanelUnit[];
  readonly plugins: readonly PanelPluginUnit[];
  readonly defaults: readonly string[];
  readonly own: boolean;
  readonly changed: Readonly<Record<string, number>>;
}

export function shouldDropPanels(workspace: string | null, previous: string | null): boolean {
  return workspace !== previous;
}

export function useEnabledUnits(
  refreshToken: number,
  workspace: string | null,
): PanelBoardView | null {
  const [enabled, setEnabled] = useState<PanelBoardView | null>(null);
  const lastWorkspace = useRef<string | null>(workspace);
  const factRev = useFactRevision('panels');

  useEffect(() => {
    let cancelled = false;
    if (shouldDropPanels(workspace, lastWorkspace.current)) {
      lastWorkspace.current = workspace;
      setEnabled(null);
    }

    const read = async (): Promise<void> => {
      const response = await apiGet<{
        units?: PanelUnit[];
        plugins?: PanelPluginUnit[];
        defaults?: string[];
        own?: boolean;
        changed?: Record<string, number>;
      }>('panels', workspace === null ? {} : { path: workspace }).catch(() => null);
      if (cancelled) return;
      if (response?.ok === true && Array.isArray(response.units)) {
        setEnabled({
          units: response.units,
          plugins: Array.isArray(response.plugins) ? response.plugins : [],
          defaults: Array.isArray(response.defaults) ? response.defaults : [],
          own: response.own === true,
          changed: response.changed ?? {},
        });
      }
    };

    void read();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, factRev, workspace]);

  return enabled;
}

export function useSelectedProjectId(): string | null {
  const [id, setId] = useState(() => selectedProjectId());
  useEffect(() => subscribeProject(() => setId(selectedProjectId())), []);
  return id;
}

export function useBoardWorkspace(
  workspaces: WorkspaceSnapshot,
  sessions: SessionsSnapshot,
): { readonly workspace: WorkspaceView | null; readonly path: string | null } {
  const projectId = useSelectedProjectId();
  const edition = useRuntimeSidebarEdition();
  const fromProject = workspaces.items.find((item) => item.workspaceId === projectId) ?? null;
  const fromSession = workspaceOfSession(workspaces.items, currentSessionId(sessions, false));
  const workspace = edition === 'official' ? (fromSession ?? fromProject) : (fromProject ?? fromSession);
  return { workspace, path: workspace?.path ?? null };
}
