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

  const disarm = (): void => {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  };

  const tick = (): void => {
    if (!read()) return;
    disarm();
    onReady();
  };

  return {
    arm() {
      if (timer !== undefined) return;
      timer = setInterval(tick, intervalMs);
    },
    disarm,
  };
}
