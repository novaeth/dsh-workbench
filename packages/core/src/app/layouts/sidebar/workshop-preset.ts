import type {
  DshAgentPresetsRemote,
  DshClientContext,
  DshSessionsService,
  WorkspaceView,
} from '@dsh-workbench/shared';
import { isWorkshopPath, workshopPresetUpgrade } from '@/shared/api/diy';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';

export function installWorkshopPreset(ctx: DshClientContext): () => void {
  const sessions = ctx.get<DshSessionsService>('sessions');
  if (sessions === undefined) return () => {};

  const asked = new Set<string>();
  const workshopOf = (): WorkspaceView | undefined =>
    ctx.workspaces.list.getSnapshot().items.find((item) => isWorkshopPath(item.path));

  const upgrade = (): void => {
    const snapshot = sessions.list.getSnapshot();
    const sessionId = currentSessionId(snapshot, false);
    if (sessionId === undefined || asked.has(sessionId)) return;
    const workshop = workshopOf();
    if (workshop === undefined) return;
    const workspace = workspaceOfSession(ctx.workspaces.list.getSnapshot().items, sessionId);
    const preset = workshopPresetUpgrade({
      workshop: workspace?.workspaceId === workshop.workspaceId,
      blank: snapshot.byId[sessionId]?.blank === true,
      preset: snapshot.byId[sessionId]?.projectionValues?.agentPreset,
    });
    if (preset === undefined) return;
    const presets = ctx.get<DshAgentPresetsRemote>('remote.agentPresets');
    if (presets === undefined) return;
    asked.add(sessionId);
    void presets.select(sessionId, preset).catch((error: unknown) => {
      console.warn(`[dsh-workbench] 工坊那条会话没切到 DIY 模式 —— ${String(error)}`);
    });
  };

  const offSessions = sessions.list.subscribe?.(upgrade) ?? (() => {});
  const offWorkspaces = ctx.workspaces.list.subscribe(upgrade);
  upgrade();
  return () => {
    offSessions();
    offWorkspaces();
  };
}
