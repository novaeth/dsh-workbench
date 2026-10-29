import type { WorkbenchAdapters } from '@dsh-workbench/shared/host';
import { createFakeDataReader, fakeAdapterSet } from '@dsh-workbench/shared/testing';
import { fsSupply } from './fs-supply';

const base = fakeAdapterSet();

export function testAdaptersWith(paths: {
  readonly root: () => string;
  readonly profile: () => string;
  readonly catalog?: () => string | undefined;
  readonly plugins?: () => string | undefined;
}): WorkbenchAdapters {
  const supply = fsSupply({
    root: paths.root,
    profile: paths.profile,
    catalog: paths.catalog ?? (() => undefined),
    plugins: paths.plugins ?? (() => undefined),
  });
  return {
    ...base,
    data: createFakeDataReader(),
    supply,
    modules: supply,
    runtime: {
      ...base.runtime,
      capabilities: () => ({ console: true, pluginMarket: true, browserBridge: true }),
    },
  };
}
