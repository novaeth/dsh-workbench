import type {
  DshClientContext,
  DshContextMenus,
  DshContextMenuTarget,
  DshMenuPoint,
  DshObservable,
  PanelEntry,
  SessionId,
  WorkspaceId,
} from '@dsh-workbench/shared';
import { LOCALE_NS } from '@dsh-workbench/shared';

const NO_MENU_TARGET: DshObservable<DshContextMenuTarget | null> = {
  getSnapshot: () => null,
  subscribe: () => () => undefined,
};

export function readPanels(ctx: DshClientContext): PanelEntry[] {
  return ctx.slots
    .entriesOfSlot('sidebar.panellist')
    .map(({ options }) => ({
      id: options.id ?? options.key ?? '',
      order: options.order ?? 0,
      label: options.label ?? options.id ?? options.key ?? '',
    }))
    .sort((a, b) => a.order - b.order);
}

function contextMenusOf(ctx: DshClientContext): DshContextMenus | undefined {
  return ctx.contextMenus;
}

export function sessionMenuSeat(ctx: DshClientContext) {
  const menus = (): DshContextMenus | undefined => contextMenusOf(ctx);
  return {
    openSessionMenu: (sessionId: string, displayTitle: string, point: DshMenuPoint): void => {
      const live = menus();
      if (live === undefined) return;
      const active = live.active.getSnapshot();
      if (active?.kind === 'session' && active.value.sessionId === sessionId) live.close();
      else live.open({ kind: 'session', value: { sessionId: sessionId as SessionId, displayTitle } }, point);
    },
    hooks: { sessionMenuTarget: menus()?.active ?? NO_MENU_TARGET },
  };
}

export function workspaceWrites(ctx: DshClientContext) {
  const t = ctx.locale.bind(LOCALE_NS);
  return {
    renameWorkspace: async (workspaceId: string, title: string) => {
      try {
        await ctx.workspaces.rename(workspaceId as WorkspaceId, title);
        return true;
      } catch {
        return false;
      }
    },
    deleteWorkspace: async (workspaceId: string) => {
      try {
        await ctx.workspaces.delete(workspaceId as WorkspaceId);
        return true;
      } catch {
        return false;
      }
    },
    revealWorkspace: (path: string) => {
      const failed = (): void => {
        contextMenusOf(ctx)?.notify(t('project.reveal.failed'), false);
      };
      void ctx.remote.session
        .openWorkspacePath({ path, action: 'reveal' })
        .then((outcome) => {
          if (!outcome.ok) failed();
        })
        .catch(failed);
    },
  };
}
