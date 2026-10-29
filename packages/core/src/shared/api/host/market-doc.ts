import { join } from 'node:path';
import type {
  DiscoverDoc,
  DiscoverDocKind,
  MarketIndexSource,
  MarketSourceConfig,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { marketSourceKey } from '@dsh-workbench/shared/host';
import type { GitRunner } from './git-process.js';
import { runGitProcess } from './git-process.js';

export interface MarketDocTarget {
  readonly name: string;
  readonly version: string;
  readonly source: MarketIndexSource;
}

export interface MarketDocReader {
  read(source: MarketSourceConfig, target: MarketDocTarget, kind: DiscoverDocKind): Promise<DiscoverDoc>;
}

export interface MarketDocReaderOptions {
  readonly root: string;
  readonly runGit?: GitRunner | undefined;
  readonly fetchImpl?: ((url: string, init: RequestInit) => Promise<Response>) | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxBytes?: number | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
}

const FILES: Readonly<Record<DiscoverDocKind, string>> = {
  readme: 'README.md',
  changelog: 'CHANGELOG.md',
};

const DEFAULT_TIMEOUT_MS = 15 * 1000;
const DEFAULT_MAX_BYTES = 200 * 1024;
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clipped(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= maxBytes) return text;
  return buffer.subarray(0, maxBytes).toString('utf8');
}

function missingText(text: string): boolean {
  return /does not exist|exists on disk, but not in|path .* not in|unknown revision|not found/i.test(text);
}

export function createMarketDocReader(options: MarketDocReaderOptions): MarketDocReader {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const runGit = options.runGit ?? runGitProcess;
  const cache = new Map<string, DiscoverDoc>();

  function fail(kind: DiscoverDocKind, version: string, reason: 'missing' | 'unavailable', detail?: string): DiscoverDoc {
    return { ok: false, kind, version, reason, ...(detail === undefined || detail === '' ? {} : { detail }) };
  }

  function remember(key: string, doc: DiscoverDoc): DiscoverDoc {
    cache.set(key, doc);
    return doc;
  }

  async function readGit(
    source: MarketSourceConfig,
    target: MarketDocTarget,
    kind: DiscoverDocKind,
  ): Promise<DiscoverDoc> {
    const git = target.source;
    if (git.type !== 'git') return fail(kind, target.version, 'missing');
    const key = `${git.commit}|${git.path ?? ''}|${kind}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const directory = (git.path ?? '').replace(/^\/+|\/+$/g, '');
    const file = directory === '' ? FILES[kind] : `${directory}/${FILES[kind]}`;
    const repo = join(options.root, 'market-index', marketSourceKey(source), 'repo.git');
    const show = () => runGit(['show', `${git.commit}:${file}`], { cwd: repo, timeoutMs, maxBytes });
    const hasCommit = async (): Promise<boolean> => {
      const checked = await runGit(['cat-file', '-e', `${git.commit}^{commit}`], { cwd: repo, timeoutMs });
      return checked.exitCode === 0;
    };
    try {
      let result = await show();
      if (result.exitCode !== 0 && !(await hasCommit())) {
        const fetched = await runGit(['fetch', '--depth', '1', 'origin', git.commit], { cwd: repo, timeoutMs });
        if (fetched.exitCode === 0) result = await show();
      }
      if (result.exitCode !== 0) {
        const text = result.stderr.trim();
        return missingText(text)
          ? fail(kind, target.version, 'missing')
          : fail(kind, target.version, 'unavailable', text);
      }
      return remember(key, { ok: true, kind, version: target.version, text: clipped(result.stdout, maxBytes) });
    } catch (error) {
      options.logger?.warn?.(`[dsh-workbench] 读 ${file} 失败：${messageOf(error)}`);
      return fail(kind, target.version, 'unavailable', messageOf(error));
    }
  }

  async function readNpm(target: MarketDocTarget, kind: DiscoverDocKind): Promise<DiscoverDoc> {
    if (kind === 'changelog') return fail(kind, target.version, 'missing');
    const source = target.source;
    const registry = (source.type === 'npm' ? (source.registry ?? DEFAULT_REGISTRY) : DEFAULT_REGISTRY).replace(
      /\/+$/,
      '',
    );
    const key = `${registry}|${target.name}|${target.version}|readme`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    try {
      const response = await fetchImpl(`${registry}/${target.name.replace('/', '%2f')}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return fail(kind, target.version, 'unavailable', `HTTP ${String(response.status)}`);
      const document = (await response.json()) as {
        readonly readme?: unknown;
        readonly versions?: Readonly<Record<string, { readonly readme?: unknown }>>;
      };
      const text = document.versions?.[target.version]?.readme ?? document.readme;
      if (typeof text !== 'string' || text.trim() === '') return fail(kind, target.version, 'missing');
      return remember(key, { ok: true, kind, version: target.version, text: clipped(text, maxBytes) });
    } catch (error) {
      options.logger?.warn?.(`[dsh-workbench] 读 ${target.name} 的说明失败：${messageOf(error)}`);
      return fail(kind, target.version, 'unavailable', messageOf(error));
    }
  }

  return {
    read: (source, target, kind) =>
      target.source.type === 'git' ? readGit(source, target, kind) : readNpm(target, kind),
  };
}
