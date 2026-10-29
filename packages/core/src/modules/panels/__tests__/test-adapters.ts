import type { WorkbenchAdapters } from '@dsh-workbench/shared/host';
import { createSupplyPort } from '@dsh-workbench/adapter-probe';
import { createFakeDataReader, fakeAdapterSet } from '@dsh-workbench/shared/testing';

const base = fakeAdapterSet();
const supply = createSupplyPort();

export const testAdapters: WorkbenchAdapters = {
  ...base,
  data: createFakeDataReader(),
  supply,
  modules: supply,
  runtime: {
    ...base.runtime,
    capabilities: () => ({ console: true, pluginMarket: true, browserBridge: true }),
  },
};
