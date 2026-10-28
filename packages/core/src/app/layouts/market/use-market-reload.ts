import { useCallback, useEffect, useRef } from 'react';
import { bumpCapabilityEpoch, markNextProbeSilent } from '@/shared/hooks/use-capabilities';
import { MARKET_STALE_MS, shouldProbeOnEnter } from '../rightbar/market-freshness';
import {
  bumpModuleVersionsEpoch,
  type ModuleVersionsView,
  type VersionsPart,
} from './use-module-versions';

export interface MarketReload {
  readonly reload: (options?: { readonly force?: boolean }) => void;
  readonly checkPart: (part: VersionsPart) => void;
}

export interface MarketReloadInput {
  readonly checkedAt: number | null;
  readonly forceProbe: () => void;
  readonly reloadCapability: () => void;
  readonly reloadVersions: ModuleVersionsView['reload'];
}

export function useMarketReload(input: MarketReloadInput): MarketReload {
  const { checkedAt, forceProbe, reloadCapability, reloadVersions } = input;
  const reload = useCallback(
    (options?: { readonly force?: boolean }): void => {
      if (options?.force === true) {
        bumpModuleVersionsEpoch();
        bumpCapabilityEpoch();
        forceProbe();
        reloadVersions({ force: true, fresh: true });
        return;
      }
      reloadCapability();
      reloadVersions();
    },
    [reloadCapability, reloadVersions, forceProbe],
  );

  const checkPart = useCallback(
    (part: VersionsPart): void => reloadVersions({ force: true, fresh: true, scope: part }),
    [reloadVersions],
  );

  const enteredRef = useRef(false);

  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    reloadVersions();
    if (!shouldProbeOnEnter({ checkedAt, now: Date.now(), staleMs: MARKET_STALE_MS })) return;
    markNextProbeSilent();
    forceProbe();
  }, [checkedAt, forceProbe, reloadVersions]);

  return { reload, checkPart };
}
