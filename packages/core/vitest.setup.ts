import { beforeEach, vi } from 'vitest';

beforeEach(async () => {
  const profile = await vi.importActual<typeof import('@dsh-workbench/adapter-profile')>('@dsh-workbench/adapter-profile');
  profile.resetReleaseCache();
  const supply = await vi.importActual<typeof import('@dsh-workbench/adapter-supply')>('@dsh-workbench/adapter-supply');
  supply.resetPackageRouteCache();
});

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
  const provided = (ctx?: { get?: (key: string, optional?: boolean) => unknown }): ReturnType<typeof getAdapters> => {
    let got: ReturnType<typeof getAdapters> | undefined;
    try {
      got = ctx?.get?.('workbenchAdapters', false) as ReturnType<typeof getAdapters> | undefined;
    } catch {
      got = undefined;
    }
    return got !== undefined && got.supply?.env !== undefined && got.modules !== undefined ? got : getAdapters();
  };
  const supply = (ctx?: { get?: (key: string, optional?: boolean) => unknown }) => {
    const adapters = provided(ctx);
    return { ...adapters.supply, ...adapters.modules, env: adapters.supply, modules: adapters.modules };
  };
  return {
    ...actual,
    adaptersOf: () => getAdapters(),
    supplyPortOf: (ctx?: never) => supply(ctx),
    profilePortOf: (ctx?: never) => provided(ctx).profile,
    cliCommandOf: () => 'opencli',
    requireSupply: (ctx?: never) => supply(ctx),
  };
});
