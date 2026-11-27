import { runsRouteOf } from '../../contract/long-task.js';
import { createLongTaskRegistry, type LongTaskBase, type LongTaskChange, type LongTaskDeps, type LongTaskRegistry } from './long-task.js';

function isRegistry(value: unknown): value is LongTaskRegistry<LongTaskBase> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LongTaskRegistry<LongTaskBase>>;
  return (
    typeof candidate.start === 'function' &&
    typeof candidate.current === 'function' &&
    typeof candidate.snapshot === 'function' &&
    typeof candidate.onChange === 'function'
  );
}

export function sharedLongTaskRegistry<S extends LongTaskBase>(
  scope: string,
  key: string,
  deps: LongTaskDeps<S>,
): LongTaskRegistry<S> {
  const store = globalThis as unknown as Record<symbol, LongTaskRegistry<LongTaskBase> | undefined>;
  const slot = Symbol.for(`dsh-workbench:long-task:${scope}:${key}`);
  const existing = store[slot];
  if (existing !== undefined && isRegistry(existing)) {
    existing.rebind?.(deps as LongTaskDeps<LongTaskBase>);
    return existing as unknown as LongTaskRegistry<S>;
  }
  const created = createLongTaskRegistry(deps);
  store[slot] = created as unknown as LongTaskRegistry<LongTaskBase>;
  return created;
}

/** 一个单元的长任务入口：按 key 建注册表。 */
export interface LongTaskHost {
  /** key 是模块内稳定的标识；run / view 必给，recheck / answer 决定行上有没有恢复与回执。 */
  create<S extends LongTaskBase>(options: { readonly key: string } & LongTaskDeps<S>): LongTaskRegistry<S>;
}

export function createLongTaskHost(options: {
  readonly scope: string;
  readonly unit: string;
  readonly bump: (facts: readonly string[]) => void;
  readonly notify?: ((change: LongTaskChange<LongTaskBase>) => void) | undefined;
}): { readonly host: LongTaskHost; dispose(): void } {
  const offs: Array<() => void> = [];
  return {
    host: {
      create(createOptions) {
        const { key, facts, ...deps } = createOptions;
        const registry = sharedLongTaskRegistry(options.scope, `${options.unit}:${key}`, deps);
        offs.push(
          registry.onChange((change) => {
            const named = [runsRouteOf(options.unit), ...(facts?.(change) ?? [])];
            options.bump([...new Set(named)]);
            options.notify?.(change);
          }),
        );
        return registry;
      },
    },
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}
