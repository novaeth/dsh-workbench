import type { DebugStore, RouteTable } from '@dsh-workbench/shared/host';

export function diyDebugRoutes(store: DebugStore): RouteTable {
  return {
    'panels/diy-debug': () => ({ ok: true, state: store.live(Date.now()) }),
  };
}
