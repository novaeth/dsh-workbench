export type QueueOutcome = 'acquired' | 'aborted' | 'timeout';

interface Waiter {
  finish(outcome: QueueOutcome): void;
}

interface Slot {
  busy: boolean;
  readonly waiters: Waiter[];
}

export interface QueueWaitEvent {
  readonly session: string;
  readonly waitedMs: number;
  readonly outcome: QueueOutcome;
}

export interface SessionQueue {
  acquire(session: string, signal: AbortSignal | undefined, waitMs: number): Promise<QueueOutcome>;
  release(session: string): void;
}

export function createSessionQueue(): SessionQueue {
  const slots = new Map<string, Slot>();

  return {
    acquire(session, signal, waitMs) {
      const slot = slots.get(session) ?? { busy: false, waiters: [] };
      slots.set(session, slot);
      if (!slot.busy) {
        slot.busy = true;
        return Promise.resolve('acquired');
      }
      if (signal?.aborted === true) return Promise.resolve('aborted');
      if (waitMs <= 0) return Promise.resolve('timeout');
      return new Promise<QueueOutcome>((resolve) => {
        let settled = false;
        const finish = (outcome: QueueOutcome): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          const at = slot.waiters.indexOf(waiter);
          if (at >= 0) slot.waiters.splice(at, 1);
          if (slot.waiters.length === 0 && !slot.busy) slots.delete(session);
          resolve(outcome);
        };
        const onAbort = (): void => finish('aborted');
        const waiter: Waiter = { finish };
        slot.waiters.push(waiter);
        const timer = setTimeout(() => finish('timeout'), waitMs);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },

    release(session) {
      const slot = slots.get(session);
      if (slot === undefined) return;
      const next = slot.waiters.shift();
      if (next !== undefined) {
        next.finish('acquired');
        return;
      }
      slot.busy = false;
      slots.delete(session);
    },
  };
}
