import { join } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import type { ProfileModule } from '@dsh-workbench/shared/host';
import type {
  DiscoverCompat,
  DiscoverDoc,
  DiscoverDocKind,
  DiscoverEntry,
  DiscoverFilter,
  DiscoverInstallState,
  DiscoverPayload,
  DiscoverSourceRow,
  DiscoverVersionRow,
  MarketIndex,
  MarketIndexEntry,
  MarketIndexVersion,
  MarketSourceConfig,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_WORKBENCH_LABEL } from '@dsh-workbench/shared/contract/protocol/market-index';
import {
  checkVersionRange,
  compareSemver,
  filterMarketIndex,
  marketEntryLabels,
  marketInstallTarget,
  quoteShellArg,
  runningVersionOf,
  runShell,
} from '@dsh-workbench/shared/host';
import type { MarketIndexReader } from '@/shared/api/host/market-index-fetch';
import type { MarketDocReader } from '@/shared/api/host/market-doc';
import type { MarketSourcesStore } from '@/shared/api/host/market-sources-store';

export interface MarketDiscover {
  snapshot(filter?: DiscoverFilter & { readonly force?: boolean }): Promise<DiscoverPayload>;
  document(name: string, version: string, kind: DiscoverDocKind): Promise<DiscoverDoc>;
}

export interface MarketDiscoverOptions {
  readonly store: MarketSourcesStore;
  readonly reader: MarketIndexReader;
  readonly docs: MarketDocReader;
  readonly modules: () => readonly ProfileModule[];
  readonly defaultRegistry: () => Promise<string | undefined>;
  readonly shell?: DshShell | undefined;
  readonly shellVersion?: string | undefined;
  readonly fetchImpl?: ((url: string, init: RequestInit) => Promise<Response>) | undefined;
  readonly now?: (() => number) | undefined;
  readonly peerTtlMs?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
}

const DEFAULT_PEER_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15 * 1000;
const CORE_PEER = '@dsh-workbench/core';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

function normalizedRepo(value: string): string {
  return value.trim().replace(/^git\+/, '').replace(/\.git$/, '').toLowerCase();
}

function isWorkbenchEntry(entry: MarketIndexEntry): boolean {
  if (entry.metadata?.workbench === true) return true;
  const labels = marketEntryLabels(entry);
  if (labels.includes(MARKET_WORKBENCH_LABEL)) return true;
  return entry.metadata?.category === MARKET_WORKBENCH_LABEL && labels.length === 0;
}

function stateOf(installed: ProfileModule | undefined, version: string, latest: string): DiscoverInstallState {
  if (installed === undefined) return 'not-installed';
  if (installed.version === version) return 'installed';
  const order = compareSemver(latest, installed.version) ?? 0;
  if (order > 0 && version === latest) return 'update-available';
  return 'different-version';
}

export function installTargetOf(
  entry: DiscoverEntry,
  version: string,
): { readonly spec: string; readonly registry?: string } | undefined {
  const row = entry.versions.find((item) => item.version === version);
  if (row === undefined) return undefined;
  return marketInstallTarget(entry.name, version, row.source);
}

export function createMarketDiscover(options: MarketDiscoverOptions): MarketDiscover {
  const now = options.now ?? Date.now;
  const peerTtlMs = options.peerTtlMs ?? DEFAULT_PEER_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shellVersion = options.shellVersion ?? runningVersionOf(import.meta.url);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const peerCache = new Map<string, { readonly at: number; readonly peer?: string }>();

  function compatOf(peer: string | undefined): DiscoverCompat {
    if (peer === undefined || peer.trim() === '') return 'ok';
    if (shellVersion === undefined) return 'unknown';
    const verdict = checkVersionRange(peer, shellVersion);
    return verdict === 'satisfied' ? 'ok' : verdict === 'unsatisfied' ? 'incompatible' : 'unknown';
  }

  async function npmPeer(registry: string, name: string, version: string): Promise<string | undefined> {
    const key = `${registry}|${name}|${version}`;
    const cached = peerCache.get(key);
    if (cached !== undefined && now() - cached.at < peerTtlMs) return cached.peer;
    try {
      const response = await fetchImpl(`${registry.replace(/\/+$/, '')}/${name.replace('/', '%2f')}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      const document = (await response.json()) as {
        readonly versions?: Readonly<Record<string, { readonly peerDependencies?: Readonly<Record<string, string>> }>>;
      };
      const peer = document.versions?.[version]?.peerDependencies?.[CORE_PEER];
      peerCache.set(key, { at: now(), peer });
      return peer;
    } catch (error) {
      options.logger?.warn?.(`[dsh-workbench] 读 ${name}@${version} 的 peer 失败：${String(error)}`);
      return undefined;
    }
  }

  async function gitPeer(source: MarketSourceConfig, version: MarketIndexVersion): Promise<string | undefined> {
    const git = version.source;
    if (git.type !== 'git') return undefined;
    if (normalizedRepo(git.url) !== normalizedRepo(source.url)) return undefined;
    if (options.shell === undefined) return undefined;
    const key = `${git.commit}|${git.path ?? ''}`;
    const cached = peerCache.get(key);
    if (cached !== undefined && now() - cached.at < peerTtlMs) return cached.peer;
    const repo = join(options.reader.pathOf(source), 'repo.git');
    const directory = (git.path ?? '').replace(/^\/+|\/+$/g, '');
    const file = directory === '' ? 'package.json' : `${directory}/package.json`;
    try {
      const result = await runShell(
        options.shell,
        `git -C ${quoteShellArg(repo)} show ${git.commit}:${quoteShellArg(file)}`,
        { timeoutMs },
      );
      if (result.exitCode !== 0) throw new Error(result.stderr.trim());
      const manifest = JSON.parse(result.stdout) as {
        readonly peerDependencies?: Readonly<Record<string, string>>;
      };
      const peer = manifest.peerDependencies?.[CORE_PEER];
      peerCache.set(key, { at: now(), peer });
      return peer;
    } catch (error) {
      options.logger?.warn?.(`[dsh-workbench] 读 git 条目的 package.json 失败：${String(error)}`);
      return undefined;
    }
  }

  async function peerOf(
    source: MarketSourceConfig,
    name: string,
    version: MarketIndexVersion,
  ): Promise<string | undefined> {
    if (version.source.type === 'git') return gitPeer(source, version);
    const registry = version.source.registry ?? (await options.defaultRegistry()) ?? DEFAULT_REGISTRY;
    return npmPeer(registry, name, version.version);
  }

  async function rowsOf(
    entry: MarketIndexEntry,
    source: MarketSourceConfig,
    installed: ProfileModule | undefined,
  ): Promise<readonly DiscoverVersionRow[]> {
    const latest = entry.versions[0]?.version ?? '';
    const rows: DiscoverVersionRow[] = [];
    for (const version of entry.versions) {
      const peer = await peerOf(source, entry.name, version);
      rows.push({
        version: version.version,
        ...(version.publishTimestamp === undefined ? {} : { publishTimestamp: version.publishTimestamp }),
        source: version.source,
        ...(version.engines === undefined ? {} : { engines: version.engines }),
        compat: compatOf(peer),
        ...(peer === undefined || peer === '' ? {} : { peer }),
        install: stateOf(installed, version.version, latest),
      });
    }
    return rows;
  }

  async function payloadOf(
    source: MarketSourceConfig,
    index: MarketIndex,
    sources: readonly DiscoverSourceRow[],
    selected: string,
    filter: DiscoverFilter,
    fetchedAt?: number,
    commit?: string,
  ): Promise<DiscoverPayload> {
    const eligible = index.plugins.filter(isWorkbenchEntry);
    const filtered = filterMarketIndex({ ...index, plugins: eligible }, filter);
    const byPkg = new Map(options.modules().map((item) => [item.pkg, item] as const));
    const entries: DiscoverEntry[] = [];
    for (const entry of filtered) {
      const installed = byPkg.get(entry.name);
      entries.push({
        name: entry.name,
        ...(entry.title === undefined ? {} : { title: entry.title }),
        ...(entry.description === undefined ? {} : { description: entry.description }),
        ...(entry.author === undefined ? {} : { author: entry.author }),
        ...(entry.homepage === undefined ? {} : { homepage: entry.homepage }),
        ...(entry.icon === undefined ? {} : { icon: entry.icon }),
        ...(entry.metadata?.category === undefined ? {} : { category: entry.metadata.category }),
        labels: marketEntryLabels(entry),
        ...(installed === undefined ? {} : { installedVersion: installed.version }),
        versions: await rowsOf(entry, source, installed),
      });
    }
    return {
      state: 'ready',
      sources,
      selected,
      entries,
      ...(fetchedAt === undefined ? {} : { fetchedAt }),
      ...(commit === undefined ? {} : { commit }),
    };
  }

  async function snapshot(filter: DiscoverFilter & { readonly force?: boolean } = {}): Promise<DiscoverPayload> {
    const { sources, selected } = options.store.read();
    const rows: DiscoverSourceRow[] = sources.map((source) => ({
      ...source,
      writable: source.kind === 'http' ? false : null,
    }));
    const source = selected === null ? undefined : sources.find((item) => item.id === selected);
    if (source === undefined) {
      return { state: 'no-source', sources: rows, selected: null, entries: [] };
    }
    const read = await options.reader.read(source, filter.force === true ? { force: true } : {});
    if (!read.ok) {
      if (read.cached === undefined) {
        return {
          state: read.problem.kind === 'format' ? 'invalid' : 'unreadable',
          sources: rows,
          selected: source.id,
          entries: [],
          problem: read.problem,
        };
      }
      return {
        ...(await payloadOf(source, read.cached.index, rows, source.id, filter, read.cached.fetchedAt, read.cached.commit)),
        stale: true,
        problem: read.problem,
      };
    }
    return payloadOf(source, read.index, rows, source.id, filter, read.fetchedAt, read.commit);
  }

  async function document(
    name: string,
    version: string,
    kind: DiscoverDocKind,
  ): Promise<DiscoverDoc> {
    const { sources, selected } = options.store.read();
    const source = selected === null ? undefined : sources.find((item) => item.id === selected);
    if (source === undefined) {
      return { ok: false, kind, version, reason: 'unavailable', detail: '没有选中的索引源' };
    }
    const read = await options.reader.read(source);
    const index = read.ok ? read.index : read.cached?.index;
    if (index === undefined) {
      return {
        ok: false,
        kind,
        version,
        reason: 'unavailable',
        ...(read.ok ? {} : { detail: read.problem.detail }),
      };
    }
    const row = index.plugins
      .find((one) => one.name === name)
      ?.versions.find((one) => one.version === version);
    if (row === undefined) return { ok: false, kind, version, reason: 'missing' };
    return options.docs.read(source, { name, version, source: row.source }, kind);
  }

  return { snapshot, document };
}
