import dayjs from 'dayjs';
import type { DshHostContext, DshRequest, DshResponse, DshWebRoute } from '@dsh-workbench/shared/host';
import { PLUGIN_ID, now, readDshPlugins, recordOf, sendJson, textOf } from '@dsh-workbench/shared/host';
import { warn } from './host-args';

export const FEATURED_ROUTE = '/dsh-plugins-plugin/featured';
export const FEATURED_SERVICE = 'featured-plugins';
export const FEATURED_CATALOG_TTL_MS = 5 * 60 * 1000;
export const FEATURED_SOURCE_ID = PLUGIN_ID;

const CATALOG_FETCH_TIMEOUT_MS = 8_000;
const CATALOG_URLS = [
  'https://cdn.jsdelivr.net/gh/skillpie/dsh-plugins@main/dsh-plugins-plugin/plugins.json',
  'https://raw.githubusercontent.com/skillpie/dsh-plugins/main/dsh-plugins-plugin/plugins.json',
] as const;
const SCREENSHOT_LIMIT = 4;
const TAG_LIMIT = 8;

export interface FeaturedEntry {
  readonly package: string;
  readonly title: string;
  readonly source: string;
  readonly description?: string;
  readonly version?: string;
  readonly icon?: string;
  readonly homepage?: string;
  readonly author?: string;
  readonly category?: string;
  readonly screenshots?: readonly string[];
  readonly stars?: number;
  readonly downloads?: number;
  readonly tags?: readonly string[];
}

export interface FeaturedSource {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly FeaturedEntry[];
}

export interface FeaturedRegistry {
  register(source: FeaturedSource): () => void;
  list(): readonly FeaturedSource[];
}

export interface FeaturedSourceSummary {
  readonly id: string;
  readonly title: string;
  readonly entries: number;
}

export interface FeaturedAggregate {
  readonly entries: readonly FeaturedEntry[];
  readonly sources: readonly FeaturedSourceSummary[];
  readonly installed: Readonly<Record<string, string>>;
  readonly remote: boolean;
}

export const FEATURED_SOURCE: FeaturedSource = {
  id: FEATURED_SOURCE_ID,
  title: '工作台',
  entries: [],
};

interface RemoteCatalog {
  readonly updated?: string;
  readonly entries?: readonly unknown[];
}

interface CatalogAttempt {
  readonly doc?: RemoteCatalog;
  readonly reason: string;
}

interface CatalogCache {
  doc?: RemoteCatalog;
  fetchedAt: number;
}

function failureTextOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function stringListOf(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    const text = textOf(item);
    if (text !== '' && !items.includes(text)) items.push(text);
    if (items.length >= limit) break;
  }
  return items;
}

function pruneOf(entry: FeaturedEntry): FeaturedEntry {
  return Object.fromEntries(
    Object.entries(entry).filter(
      ([, value]) => !(value === '' || value === undefined || (Array.isArray(value) && value.length === 0)),
    ),
  ) as FeaturedEntry;
}

export function normalizeEntry(raw: unknown, source: string): FeaturedEntry | undefined {
  const record = recordOf(raw);
  const pkg = textOf(record.package) || textOf(record.name);
  const title = textOf(record.title);
  if (pkg === '' || title === '') return undefined;
  return pruneOf({
    package: pkg,
    title,
    source,
    description: textOf(record.description) || textOf(record.detail),
    version: textOf(record.version),
    icon: textOf(record.icon),
    homepage: textOf(record.homepage),
    author: textOf(record.author),
    category: textOf(record.category),
    screenshots: stringListOf(record.screenshots, SCREENSHOT_LIMIT),
    stars: numberOrUndefined(record.stars),
    downloads: numberOrUndefined(record.downloads),
    tags: stringListOf(record.tags, TAG_LIMIT),
  });
}

export function normalizeSource(raw: unknown): FeaturedSource | undefined {
  const record = recordOf(raw);
  const id = textOf(record.id);
  if (id === '') return undefined;
  const title = textOf(record.title) || id;
  const entries: FeaturedEntry[] = [];
  if (Array.isArray(record.entries)) {
    for (const item of record.entries) {
      const entry = normalizeEntry(item, id);
      if (entry !== undefined) entries.push(entry);
    }
  }
  return { id, title, entries };
}

function createRegistry(): FeaturedRegistry {
  const sources = new Map<string, FeaturedSource>();
  return {
    register(raw) {
      const source = normalizeSource(raw);
      if (source === undefined) return () => undefined;
      sources.set(source.id, source);
      return () => {
        if (sources.get(source.id) === source) sources.delete(source.id);
      };
    },
    list: () => [...sources.values()],
  };
}

interface RegistryBox {
  readonly registry: FeaturedRegistry;
  readonly owns: boolean;
}

function registryBoxOf(ctx: DshHostContext): RegistryBox {
  try {
    const existing = ctx.get(FEATURED_SERVICE) as FeaturedRegistry | undefined;
    if (existing !== undefined) return { registry: existing, owns: false };
  } catch (error) {
    warn(ctx, `运行中的精选注册表没读到，本进程另起一份：${failureTextOf(error)}`);
  }
  const registry = createRegistry();
  try {
    ctx.effect(() => ctx.provide(FEATURED_SERVICE, registry), `${PLUGIN_ID}: 精选注册表`);
    return { registry, owns: true };
  } catch (error) {
    warn(ctx, `精选注册表由先启动的接入方持有，本进程只登记目录：${failureTextOf(error)}`);
    return { registry, owns: false };
  }
}

async function fetchCatalogAt(url: string): Promise<CatalogAttempt> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return { reason: `HTTP ${response.status}` };
    const doc = (await response.json()) as RemoteCatalog;
    if (!Array.isArray(doc.entries)) return { reason: '目录缺 entries 数组' };
    return { doc, reason: '' };
  } catch (error) {
    return { reason: failureTextOf(error) };
  }
}

function catalogScoreOf(doc: RemoteCatalog): readonly [number, number, number] {
  const updated = dayjs(textOf(doc.updated)).valueOf();
  const entries = Array.isArray(doc.entries) ? doc.entries.length : 0;
  let versionSum = 0;
  if (Array.isArray(doc.entries)) {
    for (const item of doc.entries) {
      const record = recordOf(item);
      for (const part of textOf(record.version).split('.')) {
        const num = Number(part);
        if (Number.isFinite(num)) versionSum += num;
      }
    }
  }
  return [Number.isFinite(updated) ? updated : 0, entries, versionSum];
}

function isNewerCatalog(candidate: RemoteCatalog, current: RemoteCatalog): boolean {
  const a = catalogScoreOf(candidate);
  const b = catalogScoreOf(current);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export async function fetchRemoteCatalog(): Promise<RemoteCatalog | undefined> {
  const attempts = await Promise.all(CATALOG_URLS.map((url) => fetchCatalogAt(url)));
  let newest: RemoteCatalog | undefined;
  for (const attempt of attempts) {
    if (attempt.doc === undefined) continue;
    if (newest === undefined || isNewerCatalog(attempt.doc, newest)) newest = attempt.doc;
  }
  return newest;
}

function indexEntries(entries: readonly FeaturedEntry[]): Map<string, FeaturedEntry> {
  const index = new Map<string, FeaturedEntry>();
  for (const entry of entries) {
    if (!index.has(entry.package)) index.set(entry.package, entry);
  }
  return index;
}

const RICH_KEYS = ['author', 'homepage', 'category', 'icon', 'screenshots', 'stars', 'downloads'] as const;

function richOf(entry: FeaturedEntry, remote: FeaturedEntry | undefined): FeaturedEntry {
  if (remote === undefined) return entry;
  const picks = RICH_KEYS.map((key) => [key, entry[key] ?? remote[key]] as const);
  return { ...entry, ...Object.fromEntries(picks) } as FeaturedEntry;
}

async function aggregateOf(
  ctx: DshHostContext,
  registry: FeaturedRegistry,
  remote: RemoteCatalog | undefined,
): Promise<FeaturedAggregate> {
  const snapshot = await readDshPlugins(ctx);
  const installed: Record<string, string> = {};
  for (const row of [...snapshot.bundles, ...snapshot.plugins]) {
    if (installed[row.name] === undefined || row.version !== '') installed[row.name] = row.version;
  }
  const remoteEntries: FeaturedEntry[] = [];
  if (remote !== undefined && Array.isArray(remote.entries)) {
    for (const item of remote.entries) {
      const entry = normalizeEntry(item, 'skillpie');
      if (entry !== undefined) remoteEntries.push(entry);
    }
  }
  const remoteIndex = indexEntries(remoteEntries);
  const merged = indexEntries(remoteEntries);
  const sources: FeaturedSourceSummary[] = [];
  for (const source of registry.list()) {
    sources.push({ id: source.id, title: source.title, entries: source.entries.length });
    for (const entry of source.entries) {
      if (!merged.has(entry.package)) merged.set(entry.package, entry);
    }
  }
  const entries = [...merged.values()].map((entry) => richOf(entry, remoteIndex.get(entry.package)));
  return { entries, sources, installed, remote: remote !== undefined };
}

function sameOriginOf(ctx: DshHostContext, req: DshRequest): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin === '') return true;
  const host = req.headers.host;
  if (typeof host !== 'string' || host === '') {
    warn(ctx, `请求缺 Host 头，按跨源处理：origin=${origin}`);
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch (error) {
    warn(ctx, `Origin 头没法解析，按跨源处理：${failureTextOf(error)}`);
    return false;
  }
}

function featuredRouteOf(
  ctx: DshHostContext,
  registry: FeaturedRegistry,
  remoteOf: () => Promise<RemoteCatalog | undefined>,
): DshWebRoute {
  return {
    kind: 'exact',
    path: FEATURED_ROUTE,
    handler: async (req: DshRequest, res: DshResponse): Promise<void> => {
      if (!sameOriginOf(ctx, req)) {
        sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' });
        return;
      }
      try {
        const remote = await remoteOf();
        sendJson(res, 200, { ok: true, data: await aggregateOf(ctx, registry, remote) });
      } catch (error) {
        warn(ctx, `精选目录聚合失败：${failureTextOf(error)}`);
        sendJson(res, 200, { ok: false, error: failureTextOf(error) });
      }
    },
  };
}

function mountRoute(ctx: DshHostContext, route: DshWebRoute): () => void {
  try {
    return ctx.webServer.register(route) ?? (() => undefined);
  } catch (error) {
    warn(ctx, `精选聚合路由由已注册的接入方持有：${failureTextOf(error)}`);
    return () => undefined;
  }
}

export function integrateFeaturedPlugins(
  ctx: DshHostContext,
  source: FeaturedSource = FEATURED_SOURCE,
): void {
  const box = registryBoxOf(ctx);
  try {
    ctx.effect(() => box.registry.register(source), `${PLUGIN_ID}: 精选目录登记`);
  } catch (error) {
    warn(ctx, `精选目录登记没挂上：${failureTextOf(error)}`);
  }
  if (!box.owns) return;
  const cache: CatalogCache = { doc: undefined, fetchedAt: 0 };
  const remoteOf = async (): Promise<RemoteCatalog | undefined> => {
    const at = now();
    if (at - cache.fetchedAt < FEATURED_CATALOG_TTL_MS) return cache.doc;
    const doc = await fetchRemoteCatalog();
    cache.doc = doc;
    cache.fetchedAt = at;
    return doc;
  };
  ctx.effect(() => mountRoute(ctx, featuredRouteOf(ctx, box.registry, remoteOf)), `${PLUGIN_ID}: 精选聚合路由`);
}
