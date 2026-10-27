import { vi } from 'vitest';

vi.mock('@dsh-workbench/shared/host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dsh-workbench/shared/host')>();
  const defaultAdapters = await vi.importActual<typeof import('@dsh-workbench/adapters-default')>('@dsh-workbench/adapters-default');
  let cached: ReturnType<typeof defaultAdapters.createAdapterSet> | undefined;
  const getAdapters = () => {
    cached ??= {
      ...defaultAdapters.createAdapterSet({ get: () => undefined } as never),
      data: { read: async () => ({ ok: false, error: { code: 'invalid-request', message: '测试没有注入 DataReader' } }) },
    };
    return cached;
  };
  const supply = () => {
    const adapters = getAdapters();
    return { ...adapters.supply, ...adapters.modules, env: adapters.supply, modules: adapters.modules };
  };
  return {
    ...actual,
    adaptersOf: () => getAdapters(),
    supplyPortOf: supply,
    profilePortOf: () => getAdapters().profile,
    cliCommandOf: () => 'opencli',
    requireSupply: supply,
  };
});
