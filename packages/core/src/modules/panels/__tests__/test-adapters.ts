import * as defaultAdapters from '@dsh-workbench/adapters-default';
import type { WorkbenchAdapters } from '@dsh-workbench/shared/host';
import { createFakeDataReader } from '@dsh-workbench/shared/testing';

export const testAdapters: WorkbenchAdapters = {
  data: createFakeDataReader(),
  cli: { command: 'opencli' },
  profile: {
    dirOf: defaultAdapters.profileDirOf,
    dshPlugins: defaultAdapters.dshPluginsHandler,
    selfUpdateView: defaultAdapters.readSelfUpdateView,
  },
  supply: defaultAdapters as unknown as WorkbenchAdapters['supply'],
};
