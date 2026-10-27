import { HANDOFF_TTL_MS } from '../config/constants.js';

export interface HandoffEntry {
  readonly fact: string;
  readonly key: string;
}

export interface HandoffValue {
  readonly value: unknown;
  readonly at: number;
}

export interface ValueHandoff {
  hand(entry: HandoffEntry, value: unknown, now?: number): void;
  take(entry: HandoffEntry, now?: number): HandoffValue | undefined;
}

export function handoffId(entry: HandoffEntry): string {
  return `${String(entry.fact.length)}:${entry.fact}${entry.key}`;
}

export function createValueHandoff(options: { ttlMs?: number } = {}): ValueHandoff {
  const ttlMs = options.ttlMs ?? HANDOFF_TTL_MS;
  const held = new Map<string, HandoffValue>();

  return {
    hand(entry, value, now = Date.now()) {
      held.set(handoffId(entry), { value, at: now });
    },
    take(entry, now = Date.now()) {
      const id = handoffId(entry);
      const hit = held.get(id);
      if (hit === undefined) return undefined;
      held.delete(id);
      return now - hit.at >= ttlMs ? undefined : hit;
    },
  };
}
