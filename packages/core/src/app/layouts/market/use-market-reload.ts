import { useCallback, useEffect, useRef } from 'react';
import { bumpCapabilityEpoch, markNextProbeSilent } from '@/shared/hooks/use-capabilities';
import { MARKET_STALE_MS, shouldProbeOnEnter } from '../rightbar/market-freshness';
import {
  bumpModuleVersionsEpoch,
  type ModuleVersionsView,
  type VersionsPart,
  type VersionsScope,
} from './use-module-versions';

export interface MarketReloadOptions {
  readonly force?: boolean;
}

export interface MarketCheckOptions {
  readonly force?: boolean;
  readonly scope?: VersionsScope;
}

export interface MarketReload {
  readonly reload: (options?: MarketReloadOptions) => void;
  readonly recheck: () => void;
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
    (options?: MarketReloadOptions): void => {
      if (options?.force === true) {
        bumpModuleVersionsEpoch();
        bumpCapabilityEpoch();
        forceProbe();
      } else {
        reloadCapability();
      }
      reloadVersions();
    },
    [reloadCapability, reloadVersions, forceProbe],
  );

  const check = useCallback(
    (options?: MarketCheckOptions): void => {
      reloadVersions({
        check: true,
        force: options?.force === true,
        fresh: true,
        ...(options?.scope === undefined ? {} : { scope: options.scope }),
      });
    },
    [reloadVersions],
  );

  const recheck = useCallback((): void => {
    bumpCapabilityEpoch();
    forceProbe();
    check({ force: true });
  }, [check, forceProbe]);

  const checkPart = useCallback(
    (part: VersionsPart): void => {
      check({ force: true, scope: part });
    },
    [check],
  );

  const enteredRef = useRef(false);

  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    if (!shouldProbeOnEnter({ checkedAt, now: Date.now(), staleMs: MARKET_STALE_MS })) return;
    markNextProbeSilent();
    forceProbe();
    check();
  }, [checkedAt, forceProbe, check]);

  return { reload, recheck, checkPart };
}
