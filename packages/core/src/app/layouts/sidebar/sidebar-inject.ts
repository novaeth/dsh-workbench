import type {
  DshClientContext,
  DshContextMenus,
  DshContextMenuTarget,
  DshMenuPoint,
  DshObservable,
  PanelEntry,
} from '@dsh-workbench/shared';

const NO_MENU_TARGET: DshObservable<DshContextMenuTarget | null> = {
  getSnapshot: () => null,
  subscribe: () => () => undefined,
};

export function readPanels(ctx: DshClientContext): PanelEntry[] {
  return ctx.slots
    .entriesOfSlot('sidebar.panellist')
    .map(({ options }) => ({
      id: options.id ?? options.name,
      order: options.order ?? 0,
      label: options.label ?? options.id ?? options.name,
    }))
    .sort((a, b) => a.order - b.order);
}

export function sessionMenuSeat(ctx: DshClientContext) {
  const menus = (): DshContextMenus | undefined => ctx.get<DshContextMenus>('contextMenus');
  return {
    openSessionMenu: (sessionId: string, displayTitle: string, point: DshMenuPoint): void => {
      const live = menus();
      if (live === undefined) return;
      const active = live.active.getSnapshot();
      if (active?.kind === 'session' && active.value.sessionId === sessionId) live.close();
      else live.open({ kind: 'session', value: { sessionId, displayTitle } }, point);
    },
    hooks: { sessionMenuTarget: menus()?.active ?? NO_MENU_TARGET },
  };
}
