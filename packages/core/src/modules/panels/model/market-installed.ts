import { gitAddressOf, gitTransportCandidates } from '@dsh-workbench/shared/host';
import type {
  MarketIndex,
  MarketIndexSource,
  MarketInstalledModule,
  MarketInstalledPayload,
  MarketSourceConfig,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_INSTALLED_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { RouteTable } from '@dsh-workbench/shared/host';
import type { ProfileModule } from '@dsh-workbench/shared/host';

export interface InstalledIndexInput {
  readonly sources: readonly MarketSourceConfig[];
  readonly cached: (source: MarketSourceConfig) => MarketIndex | undefined;
  readonly modules: readonly ProfileModule[];
  readonly dependencyOf: (pkg: string) => string | undefined;
  readonly isNewer: (latest: string, installed: string) => boolean;
}

function withInstalledTransport(source: MarketIndexSource, spec: string | undefined): MarketIndexSource {
  if (source.type !== 'git' || spec === undefined) return source;
  const installed = gitAddressOf(spec);
  if (installed === undefined) return source;
  const match = gitTransportCandidates(source.url).find((candidate) => candidate.kind === installed.kind);
  return match === undefined ? source : { ...source, url: match.url };
}

/**
 * 已装的模块里，哪些在当前索引里有更新的版本：版本取索引里最新那一行，
 * 地址换成「你当初装它用的那种传输」（https 装的还走 https，ssh 装的还走 ssh）。
 */
export function installedFromIndexes(input: InstalledIndexInput): readonly MarketInstalledModule[] {
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
        source: withInstalledTransport(newest.source, input.dependencyOf(entry.name)),
      });
    }
  }
  return rows;
}

export function marketInstalledRoutes(read: () => MarketInstalledPayload): RouteTable {
  return {
    [MARKET_INSTALLED_ROUTE]: () => ({ ok: true, ...read() }),
  };
}
