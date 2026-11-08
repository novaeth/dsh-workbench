import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@dsh-workbench/shared';
import { PANELS_FACT } from '@dsh-workbench/shared/contract/facts';
import {
  PANELS_ROUTE,
  type PanelPluginView as PanelPluginUnit,
  type PanelUnitView as PanelUnit,
  type PanelsPayload,
} from '@dsh-workbench/shared/contract/protocol/panels';

import { useFactRevision } from '@/shared/hooks/use-facts';
import type { SessionsSnapshot, WorkspaceSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';
import { selectedProjectId, subscribeProject } from '@/app/layouts/project-selection';
import { useRuntimeSidebarEdition } from '@/app/layouts/sidebar/edition';

export type { PanelPluginUnit, PanelUnit };

export type PanelBoardView = Omit<PanelsPayload, 'ok'>;

export function shouldDropPanels(workspace: string | null, previous: string | null): boolean {
  return workspace !== previous;
}

export function useEnabledUnits(
  refreshToken: number,
  workspace: string | null,
): PanelBoardView | null {
  const [enabled, setEnabled] = useState<PanelBoardView | null>(null);
  const lastWorkspace = useRef<string | null>(workspace);
  const factRev = useFactRevision(PANELS_FACT);

  useEffect(() => {
    let cancelled = false;
    if (shouldDropPanels(workspace, lastWorkspace.current)) {
      lastWorkspace.current = workspace;
      setEnabled(null);
    }

    const read = async (): Promise<void> => {
      const response = await apiGet<PanelsPayload>(PANELS_ROUTE, workspace === null ? {} : { path: workspace }).catch(() => null);
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
