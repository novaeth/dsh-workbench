import type { DebugStore, RouteTable } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';

export function diyDebugRoutes(store: DebugStore): RouteTable {
  return {
    [DIY_DEBUG_ROUTE]: () => ({ ok: true, state: store.live(Date.now()) }),
  };
}
