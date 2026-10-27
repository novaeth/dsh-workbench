import type { RouteTable } from '@dsh-workbench/shared/host';
import { flag, param } from '@dsh-workbench/shared/host';
import {
  MARKET_DISCOVER_ROUTE,
  MARKET_DOC_ROUTE,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import type { MarketDiscover } from './market-discover';

export function marketDiscoverRoutes(discover: MarketDiscover): RouteTable {
  return {
    [MARKET_DISCOVER_ROUTE]: async (search) => {
      const query = param(search, 'q');
      const category = param(search, 'category');
      const label = param(search, 'label');
      return {
        ok: true,
        ...(await discover.snapshot({
          ...(query === undefined ? {} : { query }),
          ...(category === undefined ? {} : { category }),
          ...(label === undefined ? {} : { label }),
          ...(flag(search, 'force') ? { force: true } : {}),
        })),
      };
    },
    [MARKET_DOC_ROUTE]: async (search) => ({
      ok: true,
      doc: await discover.document(
        (param(search, 'name') ?? '').trim(),
        (param(search, 'version') ?? '').trim(),
        param(search, 'kind') === 'changelog' ? 'changelog' : 'readme',
      ),
    }),
  };
}
