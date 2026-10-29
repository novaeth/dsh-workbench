import type { RuntimeCommandSurface, WorkbenchAdapters } from '@dsh-workbench/shared/host';
import { createFakeDataReader, fakeAdapterSet } from '@dsh-workbench/shared/testing';
import { fsSupply } from './fs-supply';

const base = fakeAdapterSet();

export const opencliSurface: RuntimeCommandSurface = {
  name: 'opencli',
  pluginPrefix: 'opencli-plugin-',
  invoke: (site, command) => (command === undefined || command === '' ? `opencli ${site}` : `opencli ${site} ${command}`),
  help: (site) => `opencli ${site} --help`,
  authorHint: 'opencli skills read opencli-adapter-author',
};

export function testAdaptersWith(paths: {
  readonly root: () => string;
  readonly profile: () => string;
  readonly catalog?: () => string | undefined;
  readonly plugins?: () => string | undefined;
  readonly surface?: RuntimeCommandSurface | null;
}): WorkbenchAdapters {
  const surface = paths.surface === undefined ? opencliSurface : paths.surface;
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
      ...(surface === null ? { commandSurface: () => undefined } : { commandSurface: () => surface }),
    },
  };
}
