import type { InstalledPackageInfo } from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_INSTALLED_INFO_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import { param, type RouteTable } from '@dsh-workbench/shared/host';

export function installedPackageRoutes(
  read: (pkg: string) => InstalledPackageInfo | null,
): RouteTable {
  return {
    [MARKET_INSTALLED_INFO_ROUTE]: async (search) => ({
      ok: true,
      info: read((param(search, 'pkg') ?? '').trim()),
    }),
  };
}
