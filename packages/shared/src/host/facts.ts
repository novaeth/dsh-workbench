import { randomUUID } from 'node:crypto';
import type { UnitManifest } from '../api/unit.js';
import { FACT_SCOPE_SUFFIX } from '../api/facts.js';

export interface FactChange {
  readonly rev: number;
  readonly facts: readonly string[];
}

export interface FactSnapshot extends FactChange {
  readonly epoch: string;
}

export interface FactLog {
  bump(facts: readonly string[]): FactChange;
  revision(): number;
  epoch(): string;
  since(rev: number): FactSnapshot;
  subscribe(listener: (change: FactChange) => void): () => void;
}

export function createFactLog(options: { readonly epoch?: string } = {}): FactLog {
  const epoch = options.epoch ?? `e${randomUUID()}`;
  let rev = 0;
  const last = new Map<string, number>();
  const listeners = new Set<(change: FactChange) => void>();

  return {
    epoch: () => epoch,
    revision: () => rev,
    bump(facts) {
      rev += 1;
      const named = [...new Set(facts.filter((name) => name !== ''))];
      for (const name of named) last.set(name, rev);
      const change: FactChange = { rev, facts: named };
      for (const listener of [...listeners]) listener(change);
      return change;
    },
    since(seen) {
      const facts = [...last.entries()].filter(([, at]) => at > seen).map(([name]) => name);
      return { epoch, rev, facts };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface ToolUnit {
  readonly unit: string;
  readonly writes: boolean;
}

export function toolUnits(manifests: readonly UnitManifest[]): Map<string, ToolUnit> {
  const map = new Map<string, ToolUnit>();
  for (const manifest of manifests) {
    for (const tool of manifest.tools ?? []) {
      map.set(tool.name, { unit: manifest.id, writes: tool.writes });
    }
  }
  return map;
}

export function wroteNow(result: unknown): boolean | undefined {
  const value = (result as { value?: unknown } | null)?.value;
  const wrote = (value as { wrote?: unknown } | null)?.wrote;
  return typeof wrote === 'boolean' ? wrote : undefined;
}

/**
 * 由单元 id 拼出它那一族事实的范围名。
 * @param unit 单元 id，不带后缀。
 * @returns <unit>* —— 永远是范围名，不是某一条事实。
 */
export function unitFactScope(unit: string): string {
  return `${unit}${FACT_SCOPE_SUFFIX}`;
}
