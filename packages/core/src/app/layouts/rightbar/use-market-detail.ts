import { useLayoutEffect, useState } from 'react';
import type { MarketRow } from './market-row-types';
import type { SharedRow } from './market-shared-rows';

export interface MarketDetailState {
  readonly detailId: string | null;
  readonly setDetailId: (id: string | null) => void;
  readonly detailRow: MarketRow | undefined;
  readonly detailShared: SharedRow | undefined;
  readonly detailOpen: boolean;
}

export function useMarketDetail(
  rowById: ReadonlyMap<string, MarketRow>,
  shared: readonly SharedRow[],
  onDetailChange?: ((open: boolean) => void) | undefined,
): MarketDetailState {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRow = detailId === null ? undefined : rowById.get(detailId);
  const detailShared = detailId === null ? undefined : shared.find((row) => row.id === detailId);
  const detailOpen = detailRow !== undefined || detailShared !== undefined;
  useLayoutEffect(() => {
    onDetailChange?.(detailOpen);
  }, [detailOpen, onDetailChange]);
  return { detailId, setDetailId, detailRow, detailShared, detailOpen };
}
