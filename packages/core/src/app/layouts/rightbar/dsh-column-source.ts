export interface DshColumnSource {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
}

export const DSH_COLUMN_POLL_MS = 400;

export function createDshColumnSource(read: () => boolean, intervalMs: number): DshColumnSource {
  let value = read();
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();

  const sync = (): void => {
    const next = read();
    if (next === value) return;
    value = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => value,

    subscribe(listener) {
      listeners.add(listener);
      if (timer === undefined) timer = setInterval(sync, intervalMs);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
  };
}
