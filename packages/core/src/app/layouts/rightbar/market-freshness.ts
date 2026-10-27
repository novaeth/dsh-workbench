import { VERSION_CHECK_TTL_MS } from '@dsh-workbench/shared';
import type { Translate } from '@dsh-workbench/shared';

export const MARKET_STALE_MS = VERSION_CHECK_TTL_MS;

export function checkedAgoText(at: number, now: number, t: Translate): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return t('panels.market.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('panels.market.minutesAgo', { n: String(minutes) });
  return t('panels.market.hoursAgo', { n: String(Math.floor(minutes / 60)) });
}

export interface MarketFreshness {
  readonly loaded: boolean;
  readonly checking: boolean;
  readonly checkedAt: number | null;
}

export function marketSettled(freshness: MarketFreshness, installedRead: boolean | undefined): boolean {
  return freshness.loaded && installedRead !== false;
}

export function shouldProbeOnEnter(input: {
  readonly checkedAt: number | null;
  readonly now: number;
  readonly staleMs: number;
}): boolean {
  if (input.checkedAt === null) return true;
  return input.now - input.checkedAt >= input.staleMs;
}
