import type { BoardModule } from '@dsh-workbench/shared';

export interface BoardRegistry {
  register(module: BoardModule): () => void;
  all(): readonly BoardModule[];
  byId(id: string): BoardModule | undefined;
  stepOwner(kind: string): BoardModule | undefined;
  subscribe(listener: () => void): () => void;
  version(): number;
}

export function createBoardRegistry(): BoardRegistry {
  const modules: BoardModule[] = [];
  const listeners = new Set<() => void>();
  let revision = 0;
  let sorted: readonly BoardModule[] = [];
  let index = new Map<string, BoardModule>();
  let steps = new Map<string, BoardModule>();

  function rebuild(): void {
    sorted = [...modules].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    index = new Map(sorted.map((module) => [module.id, module]));

    const table = new Map<string, BoardModule>();
    for (const module of sorted) {
      for (const kind of Object.keys(module.steps ?? {})) {
        const owner = table.get(kind);
        if (owner !== undefined) {
          throw new Error(`看板层名重复：${kind}（${owner.id} 与 ${module.id} 都声明了它）`);
        }
        table.set(kind, module);
      }
    }
    steps = table;
  }

  function notify(): void {
    revision += 1;
    for (const listener of listeners) listener();
  }

  return {
    register(module) {
      if (modules.some((item) => item.id === module.id)) {
        throw new Error(`看板模块 id 重复：${module.id}（id 会进持久化配置，不能撞）`);
      }
      modules.push(module);
      try {
        rebuild();
      } catch (error) {
        modules.pop();
        rebuild();
        throw error;
      }
      notify();

      return () => {
        const at = modules.indexOf(module);
        if (at < 0) return;
        modules.splice(at, 1);
        rebuild();
        notify();
      };
    },

    all: () => sorted,

    byId: (id) => index.get(id),

    stepOwner: (kind) => steps.get(kind),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    version: () => revision,
  };
}
