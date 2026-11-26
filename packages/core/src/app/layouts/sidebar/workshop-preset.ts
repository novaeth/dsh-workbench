import type { DshClientContext, SessionId, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { isWorkshopPath, workshopPresetUpgrade } from '@/shared/api/diy';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';

export function installWorkshopPreset(ctx: DshClientContext): () => void {
  const sessions = ctx.get('sessions');
  if (sessions === undefined) return () => {};

  const asked = new Set<string>();
  const pending = new Set<string>();
  const failures = new Map<string, number>();
  const notified = new Set<string>();
  const presets = ctx.remote.agentPresets;
  let defaultPreset: string | undefined;
  let learnedDefault = false;
  let learning = false;

  const workshopOf = (): WorkspaceView | undefined =>
    ctx.workspaces.list.getSnapshot().items.find((item) => isWorkshopPath(item.path));

  const reasonOf = (error: unknown): string =>
    error instanceof Error ? error.message : JSON.stringify(error) ?? String(error);

  const notice = (sessionId: string): void => {
    if (notified.has(sessionId)) return;
    notified.add(sessionId);
    ctx.get('contextMenus')?.notify('工坊会话未切换到 DIY 模式。请在模式选择器中选择 DIY 模式。', false);
  };

  const failed = (sessionId: string, error: unknown): void => {
    pending.delete(sessionId);
    const count = (failures.get(sessionId) ?? 0) + 1;
    failures.set(sessionId, count);
    if (count >= 3) notice(sessionId);
    console.warn(`[dsh-workbench] 工坊会话未切换到 DIY 模式：${reasonOf(error)}`);
  };

  const learnDefault = (): void => {
    if (learnedDefault || learning || presets === undefined) return;
    learning = true;
    void presets
      .list()
      .then((roster) => {
        learning = false;
        if (!roster.ok) return;
        defaultPreset = roster.value.presets.find((one) => one.isDefault)?.id;
        learnedDefault = true;
        upgrade();
      })
      .catch((error: unknown) => {
        learning = false;
        console.warn(`[dsh-workbench] 读不到 dsh 的默认模式，工坊会话按标准模式处理 —— ${String(error)}`);
      });
  };

  const upgrade = (): void => {
    learnDefault();
    const snapshot = sessions.list.getSnapshot() as SessionsSnapshot;
    const sessionId = currentSessionId(snapshot, false);
    if (sessionId === undefined || asked.has(sessionId) || pending.has(sessionId)) return;
    const workshop = workshopOf();
    if (workshop === undefined) return;
    if (presets === undefined) return;
    const workspace = workspaceOfSession(ctx.workspaces.list.getSnapshot().items, sessionId);
    const preset = workshopPresetUpgrade({
      workshop: workspace?.workspaceId === workshop.workspaceId,
      blank: snapshot.byId[sessionId]?.blank === true,
      preset: snapshot.byId[sessionId]?.projectionValues?.agentPreset,
      ...(defaultPreset === undefined ? {} : { defaultPreset }),
    });
    if (preset === undefined) return;
    pending.add(sessionId);
    void presets.select(sessionId as SessionId, preset).then(
      (result) => {
        if (result.ok) {
          asked.add(sessionId);
          failures.delete(sessionId);
          pending.delete(sessionId);
          return;
        }
        failed(sessionId, result);
      },
      (error: unknown) => {
        failed(sessionId, error);
      },
    );
  };

  const offSessions = sessions.list.subscribe?.(upgrade) ?? (() => {});
  const offWorkspaces = ctx.workspaces.list.subscribe(upgrade);
  upgrade();
  return () => {
    offSessions();
    offWorkspaces();
  };
}
