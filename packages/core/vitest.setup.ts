import { vi } from 'vitest';

vi.mock('@dsh-workbench/shared/host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dsh-workbench/shared/host')>();
  const defaultAdapters = await vi.importActual<typeof import('@dsh-workbench/adapters-default')>('@dsh-workbench/adapters-default');
  const adapters = {
    data: { read: async () => ({ ok: false, error: { code: 'invalid-request', message: '测试没有注入 DataReader' } }) },
    cli: { command: 'opencli' },
    profile: {
      dirOf: defaultAdapters.profileDirOf,
      dshPlugins: defaultAdapters.dshPluginsHandler,
      selfUpdateView: defaultAdapters.readSelfUpdateView,
    },
    supply: defaultAdapters,
  };
  return {
    ...actual,
    adaptersOf: () => adapters,
    supplyPortOf: () => adapters.supply,
    profilePortOf: () => adapters.profile,
    cliCommandOf: () => adapters.cli.command,
    requireSupply: () => adapters.supply,
  };
});
