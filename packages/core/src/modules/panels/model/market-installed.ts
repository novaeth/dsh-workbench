import { gitAddressOf, gitTransportCandidates } from '@dsh-workbench/shared/host';
import type {
  GitTransportKind,
  MarketIndex,
  MarketIndexSource,
  MarketInstalledModule,
  MarketInstalledPayload,
  MarketSourceConfig,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_INSTALLED_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { RouteTable } from '@dsh-workbench/shared/host';
import type { ProfileModule } from '@dsh-workbench/shared/host';
import type { GitProbeStatus } from '@dsh-workbench/shared/contract/protocol/market-index';

export interface InstalledIndexInput {
  readonly sources: readonly MarketSourceConfig[];
  readonly cached: (source: MarketSourceConfig) => MarketIndex | undefined;
  readonly modules: readonly ProfileModule[];
  readonly dependencyOf: (pkg: string) => string | undefined;
  readonly isNewer: (latest: string, installed: string) => boolean;
  readonly probe?: ((url: string) => Promise<GitProbeStatus>) | undefined;
  readonly preferred?: ((host: string) => GitTransportKind | undefined) | undefined;
}

/**
 * 用哪种传输，现问现定：先试你当初装它那种（多半还通），不通就换另一种；
 * 两种都读不到才退回原来那种，让更新自己去报那句话。
 */
async function transportOf(
  source: MarketIndexSource,
  spec: string | undefined,
  probe: ((url: string) => Promise<GitProbeStatus>) | undefined,
  preferred: GitTransportKind | undefined,
): Promise<MarketIndexSource> {
  if (source.type !== 'git' || probe === undefined) return source;
  const candidates = gitTransportCandidates(source.url);
  if (candidates.length === 0) return source;
  const installed = spec === undefined ? undefined : gitAddressOf(spec);
  const first = preferred ?? installed?.kind;
  const ordered =
    first === undefined
      ? candidates
      : [...candidates].sort((left, right) => Number(right.kind === first) - Number(left.kind === first));
  for (const candidate of ordered) {
    const status = await probe(candidate.url).catch(() => 'unreachable' as const);
    if (status === 'ok') return { ...source, url: candidate.url };
  }
  return { ...source, url: ordered[0]?.url ?? source.url };
}

/**
 * 已装的模块里，哪些在当前索引里有更新的版本：版本取索引里最新那一行，
 * 地址换成「你当初装它用的那种传输」（https 装的还走 https，ssh 装的还走 ssh）。
 */
export async function installedFromIndexes(
  input: InstalledIndexInput,
): Promise<readonly MarketInstalledModule[]> {
  const modules = new Map(input.modules.map((module) => [module.pkg, module] as const));
  const rows: MarketInstalledModule[] = [];
  const seen = new Set<string>();
  for (const source of input.sources) {
    const index = input.cached(source);
    if (index === undefined) continue;
    for (const entry of index.plugins) {
      const module = modules.get(entry.name);
      const newest = entry.versions[0];
      if (module === undefined || newest === undefined || seen.has(entry.name)) continue;
      if (!input.isNewer(newest.version, module.version)) continue;
      seen.add(entry.name);
      rows.push({
        pkg: entry.name,
        unit: module.unit,
        version: newest.version,
        sourceId: source.id,
        sourceLabel: source.label,
        source: newest.source,
      });
      const wanted = input.dependencyOf(entry.name);
      const host = gitAddressOf(source.url)?.host;
      const resolved = await transportOf(
        newest.source,
        wanted,
        input.probe,
        host === undefined ? undefined : input.preferred?.(host),
      );
      rows[rows.length - 1] = { ...(rows[rows.length - 1] as MarketInstalledModule), source: resolved };
    }
  }
  return rows;
}

export function marketInstalledRoutes(
  read: () => MarketInstalledPayload | Promise<MarketInstalledPayload>,
): RouteTable {
  return {
    [MARKET_INSTALLED_ROUTE]: async () => ({ ok: true, ...(await read()) }),
  };
}

export function transportOfSpec(spec: string): { readonly host: string; readonly kind: GitTransportKind } | undefined {
  const address = gitAddressOf(spec);
  return address === undefined ? undefined : { host: address.host, kind: address.kind };
}
