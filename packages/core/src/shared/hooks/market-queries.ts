import type { ApiResponse } from '@dsh-workbench/shared';
import { apiGet } from '@dsh-workbench/shared';
import {
  MARKET_DISCOVER_ROUTE,
  MARKET_DOC_ROUTE,
  MARKET_GIT_PROBE_ROUTE,
  MARKET_INSTALLED_ROUTE,
  MARKET_PUBLISH_PREVIEW_ROUTE,
  MARKET_SOURCES_ROUTE,
  type DiscoverDoc,
  type DiscoverDocKind,
  type DiscoverPayload,
  type GitProbePayload,
  type MarketInstalledPayload,
  type MarketSourcesPayload,
  type PublishPreview,
} from '@/kernel/contract/market-index';

export function readMarketDiscover(options: { readonly force?: boolean } = {}): Promise<ApiResponse<DiscoverPayload>> {
  return apiGet<DiscoverPayload>(MARKET_DISCOVER_ROUTE, options.force === true ? { force: '1' } : {});
}

export function readMarketSources(): Promise<ApiResponse<MarketSourcesPayload>> {
  return apiGet<MarketSourcesPayload>(MARKET_SOURCES_ROUTE);
}

export function readGitProbe(url: string): Promise<ApiResponse<GitProbePayload>> {
  return apiGet<GitProbePayload>(MARKET_GIT_PROBE_ROUTE, { url });
}

export function readMarketInstalled(): Promise<ApiResponse<MarketInstalledPayload>> {
  return apiGet<MarketInstalledPayload>(MARKET_INSTALLED_ROUTE);
}

export function readMarketDoc(
  name: string,
  version: string,
  kind: DiscoverDocKind,
): Promise<ApiResponse<{ readonly doc: DiscoverDoc }>> {
  return apiGet<{ readonly doc: DiscoverDoc }>(MARKET_DOC_ROUTE, { name, version, kind });
}

export function readPublishPreview(
  unit: string,
  version?: string,
  author?: string,
  changelog?: string,
  changelogType?: string,
): Promise<ApiResponse<{ readonly preview: PublishPreview | null }>> {
  return apiGet<{ readonly preview: PublishPreview | null }>(MARKET_PUBLISH_PREVIEW_ROUTE, {
    unit,
    ...(version === undefined || version === '' ? {} : { version }),
    ...(author === undefined || author === '' ? {} : { author }),
    ...(changelog === undefined || changelog.trim() === '' ? {} : { changelog }),
    ...(changelogType === undefined || changelogType === '' ? {} : { changelogType }),
  });
}
