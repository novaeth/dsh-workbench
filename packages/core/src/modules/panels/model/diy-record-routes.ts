import type { RecordStore, RouteTable } from '@dsh-workbench/shared/host';
import { DIY_RECORD_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';

export function diyRecordRoutes(store: RecordStore): RouteTable {
  return {
    [DIY_RECORD_ROUTE]: () => ({ ok: true, state: store.live(Date.now()) }),
  };
}
