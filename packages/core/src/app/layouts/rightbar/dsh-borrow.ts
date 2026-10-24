import type { DshSidebarRight } from '@dsh-workbench/shared';
import { createDshSurfaceWatch, DSH_SURFACE_POLL_MS, dshSeatOnScreen } from './dsh-surface';

export interface DshBorrowHost {
  official(): DshSidebarRight | undefined;
  yieldColumn(): void;
  reclaimColumn(): void;
}

export interface DshBorrow {
  open(): boolean;
  use(call?: () => void): void;
  toggle(): void;
  back(): void;
  start(): void;
  dispose(): void;
}

export function createDshBorrow(host: DshBorrowHost): DshBorrow {
  let pendingOpen = false;
  let pendingCall: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let restore: (() => void) | undefined;
  let shimmed = false;

  const flush = (): void => {
    const official = host.official();
    if (official === undefined || !dshSeatOnScreen(document)) return;
    if (pendingOpen) {
      pendingOpen = false;
      if (!official.isExpanded()) official.toggleExpanded();
    }
    const call = pendingCall;
    pendingCall = undefined;
    call?.();
  };

  const watch = createDshSurfaceWatch(() => dshSeatOnScreen(document), flush, DSH_SURFACE_POLL_MS);

  const subscribe = (): void => {
    const official = host.official();
    if (official === undefined || unsubscribe !== undefined) return;
    unsubscribe = official.mounted.subscribe(() => {
      watch.arm();
      flush();
    });
  };

  const enter = (call: (() => void) | undefined): boolean => {
    const official = host.official();
    if (official === undefined) return false;
    if (dshSeatOnScreen(document)) {
      if (!official.isExpanded()) official.toggleExpanded();
      call?.();
      return true;
    }
    subscribe();
    watch.arm();
    host.yieldColumn();
    pendingOpen = true;
    if (call !== undefined) pendingCall = call;
    return false;
  };

  const takeSeat = (call?: () => void): void => {
    shim();
    if (host.official() === undefined) return;
    enter(call);
  };

  const shim = (): void => {
    const official = host.official();
    if (official === undefined || shimmed) return;
    const { openResource, openTab } = official;
    if (typeof openResource !== 'function' || typeof openTab !== 'function') return;
    shimmed = true;
    official.openResource = (address, options) =>
      takeSeat(() => openResource.call(official, address, options));
    official.openTab = (kind, options) => takeSeat(() => openTab.call(official, kind, options));
    restore = () => {
      official.openResource = openResource;
      official.openTab = openTab;
      shimmed = false;
    };
  };

  return {
    open() {
      const official = host.official();
      if (official === undefined) return false;
      return official.mounted.getSnapshot() === undefined || official.isExpanded();
    },

    use: takeSeat,

    toggle() {
      const official = host.official();
      if (official === undefined) return;
      if (!dshSeatOnScreen(document)) {
        pendingOpen = true;
        watch.arm();
        return;
      }
      official.toggleExpanded();
    },

    back() {
      pendingOpen = false;
      pendingCall = undefined;
      watch.disarm();
      host.reclaimColumn();
    },

    start() {
      shim();
      subscribe();
    },

    dispose() {
      unsubscribe?.();
      unsubscribe = undefined;
      watch.disarm();
      restore?.();
      restore = undefined;
    },
  };
}
