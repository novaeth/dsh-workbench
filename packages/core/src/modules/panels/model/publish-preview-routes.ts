import type { RouteTable } from '@dsh-workbench/shared/host';
import { param } from '@dsh-workbench/shared/host';
import { MARKET_PUBLISH_PREVIEW_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import { publishPreviewOf } from '@/shared/api/host/diy-publish-preview';

export function publishPreviewRoutes(
  workshop: string | null,
  inferredAuthorOf: (unit: string) => Promise<string | undefined> = async () => undefined,
): RouteTable {
  return {
    [MARKET_PUBLISH_PREVIEW_ROUTE]: async (search) => {
      const unit = (param(search, 'unit') ?? '').trim();
      const version = (param(search, 'version') ?? '').trim();
      const author = (param(search, 'author') ?? '').trim();
      if (unit === '') return { ok: true, preview: null };
      let preview = publishPreviewOf(workshop, unit, { version, author });
      if (preview !== null && author === '' && (preview.author === undefined || preview.author === '')) {
        const inferred = await inferredAuthorOf(unit);
        if (inferred !== undefined && inferred !== '') {
          const again = publishPreviewOf(workshop, unit, { version, author: inferred });
          if (again !== null) preview = again;
        }
      }
      return { ok: true, preview };
    },
  };
}
