import { useEffect, useState } from 'react';

import type { MarketMock } from './market-mock';
import type { Pending } from './market-view-text';

export interface MarketTransient {
  readonly pending: Pending | null;
  readonly setPending: (next: Pending | null) => void;
  readonly confirming: string | null;
  readonly setConfirming: (next: string | null) => void;
  readonly failed: { readonly id: string; readonly message: string } | null;
  readonly setFailed: (next: { readonly id: string; readonly message: string } | null) => void;
  readonly notice: string | null;
  readonly setNotice: (next: string | null) => void;
}

export function useMarketTransient(input: {
  readonly mock: MarketMock | undefined;
  readonly onPending?: ((pending: boolean) => void) | undefined;
}): MarketTransient {
  const { mock, onPending } = input;
  const [pending, setPending] = useState<Pending | null>(mock?.pending ?? null);
  const [confirming, setConfirming] = useState<string | null>(mock?.confirming ?? null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(mock?.failure ?? null);
  const [notice, setNotice] = useState<string | null>(mock?.notice ?? null);

  useEffect(() => {
    onPending?.(pending !== null);
    return () => onPending?.(false);
  }, [pending, onPending]);

  return { pending, setPending, confirming, setConfirming, failed, setFailed, notice, setNotice };
}
