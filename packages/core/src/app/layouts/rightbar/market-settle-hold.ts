import { useEffect, useRef } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { WorkbenchSelfUpdate } from '@/kernel/contract/bundle-install';

import { WORKBENCH_SWAP_POLL_MS, holdWindowMs, selfUpdateStop } from './market-settle';
import type { Pending } from './market-view-text';

export function useSettleHold(input: {
  readonly pending: Pending | null;
  readonly landed: boolean;
  readonly t: Translate;
  readonly onChanged: () => void;
  readonly selfUpdate?: WorkbenchSelfUpdate | null | undefined;
  readonly setPending: (next: Pending | null) => void;
  readonly setFailed: (next: { readonly id: string; readonly message: string } | null) => void;
}): void {
  const { pending, landed, t, onChanged, selfUpdate, setPending, setFailed } = input;
  const until = pending?.until;
  const id = pending?.id ?? '';
  const watching = pending !== null && (pending.until !== undefined || pending.readBack === true);
  const sinceRef = useRef(0);
  const stop = selfUpdateStop({ until, since: pending?.since, update: selfUpdate });
  const stopKind = stop?.kind;
  const stopReason = stop?.reason;
  const stopVersion = stop?.version;

  useEffect(() => {
    if (!watching || !landed) return;
    setPending(null);
  }, [watching, landed, setPending]);

  useEffect(() => {
    if (stopKind === undefined) return;
    setPending(null);
    setFailed({
      id,
      message:
        stopKind === 'failed'
          ? t('panels.market.selfUpdateFailed', {
              reason: stopReason ?? t('panels.market.selfUpdateUnknown'),
            })
          : t('panels.market.selfUpdateRolledBack', { version: stopVersion ?? '?' }),
    });
  }, [stopKind, stopReason, stopVersion, id, setPending, setFailed, t]);

  useEffect(() => {
    if (!watching) {
      sinceRef.current = 0;
      return undefined;
    }
    if (sinceRef.current === 0) sinceRef.current = Date.now();
    const deadline = sinceRef.current + holdWindowMs(until);
    const tick = window.setInterval(() => {
      onChanged();
      if (Date.now() < deadline) return;
      window.clearInterval(tick);
      setPending(null);
      setFailed({ id, message: t('panels.market.swapSlow') });
    }, WORKBENCH_SWAP_POLL_MS);
    return () => window.clearInterval(tick);
  }, [watching, landed, until, id, onChanged, setPending, setFailed, t]);
}
