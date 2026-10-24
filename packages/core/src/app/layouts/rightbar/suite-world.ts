import type { SessionsSnapshot, WorkspaceSnapshot } from '@dsh-workbench/shared';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { SuiteWorld } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';
import type { PanelUnit } from './use-panels';

export interface SuiteWorldInput {
  readonly workspaces: WorkspaceSnapshot;
  readonly sessions: SessionsSnapshot;
  readonly manifests: readonly UnitManifest[];
  readonly units: readonly PanelUnit[] | null;
  readonly capabilities: CapabilityMap | null;
  readonly selectedWorkspaceId?: string | undefined;
}

export function createSuiteWorld(input: SuiteWorldInput): SuiteWorld {
  const sessionId = currentSessionId(input.sessions, false);
  return {
    workspaces: input.workspaces,
    sessions: input.sessions,
    manifests: input.manifests,
    panelConfig:
      input.units === null
        ? null
        : { shown: Object.fromEntries(input.units.map((unit) => [unit.id, unit.shown])) },
    capabilities: input.capabilities,
    current: {
      sessionId: sessionId ?? null,
      workspace:
        input.workspaces.items.find((item) => item.workspaceId === input.selectedWorkspaceId) ??
        workspaceOfSession(input.workspaces.items, sessionId),
    },
  };
}
