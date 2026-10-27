export const DSH_SEAT_ATTRIBUTE = 'data-sidebar-right-session';

export interface DshSeatHost {
  querySelector(selector: string): unknown;
}

export function dshSeatOnScreen(host: DshSeatHost | undefined): boolean {
  if (host === undefined) return false;
  return host.querySelector(`[${DSH_SEAT_ATTRIBUTE}]`) !== null;
}

export const DSH_SURFACE_POLL_MS = 60;

export interface DshSurfaceWatch {
  arm(): void;
  disarm(): void;
}

export function createDshSurfaceWatch(
  read: () => boolean,
  onReady: () => void,
  intervalMs: number,
): DshSurfaceWatch {
  let timer: ReturnType<typeof setInterval> | undefined;
  let observer: MutationObserver | undefined;

  const disarm = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    observer?.disconnect();
    observer = undefined;
  };

  const tick = (): void => {
    if (!read()) return;
    disarm();
    onReady();
  };

  const observe = (): void => {
    if (observer !== undefined || typeof MutationObserver === 'undefined') return;
    const root = typeof document === 'undefined' ? undefined : document.documentElement;
    if (root === undefined || root === null) return;
    observer = new MutationObserver(tick);
    observer.observe(root, {
      attributes: true,
      attributeFilter: [DSH_SEAT_ATTRIBUTE],
      childList: true,
      subtree: true,
    });
  };

  return {
    arm() {
      if (timer !== undefined) return;
      timer = setInterval(tick, intervalMs);
      observe();
    },
    disarm,
  };
}
