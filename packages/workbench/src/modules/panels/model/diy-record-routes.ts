import type { RecordStore, RouteTable } from '@dsh-workbench/shared/host';

export function diyRecordRoutes(store: RecordStore): RouteTable {
  return {
    'panels/diy-record': () => ({ ok: true, state: store.live(Date.now()) }),
  };
}
