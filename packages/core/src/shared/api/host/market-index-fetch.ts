import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import type { DshShell } from '@dsh-workbench/shared';
import type {
  DiscoverProblem,
  IndexSourceSpec,
  MarketIndex,
  MarketSourceConfig,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { gitUrlOk, httpUrlProblem, marketSourceKey, parseMarketIndexJson } from '@dsh-workbench/shared/host';
import { quoteShellArg, runShell } from '@dsh-workbench/shared/host';
import { gitNoPromptPrefix, withoutAskpassNoise } from './git-exec.js';

export interface CachedIndex {
  readonly index: MarketIndex;
  readonly fetchedAt: number;
  readonly commit?: string;
}

export type IndexRead =
  | {
      readonly ok: true;
      readonly index: MarketIndex;
      readonly fetchedAt: number;
      readonly commit?: string;
    }
  | {
      readonly ok: false;
      readonly problem: DiscoverProblem;
      readonly cached?: CachedIndex;
    };

export interface MarketIndexReader {
  read(source: MarketSourceConfig, options?: { readonly force?: boolean }): Promise<IndexRead>;
  cached(source: IndexSourceSpec): CachedIndex | undefined;
  pathOf(source: IndexSourceSpec): string;
}

export interface MarketIndexReaderOptions {
  readonly root: string;
  readonly shell?: DshShell | undefined;
  readonly fetchImpl?: ((url: string, init: RequestInit) => Promise<Response>) | undefined;
  readonly now?: (() => number) | undefined;
  readonly ttlMs?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxBytes?: number | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function directoryOf(root: string, source: IndexSourceSpec): string {
  return join(root, 'market-index', marketSourceKey(source));
}

function indexFileOf(root: string, source: IndexSourceSpec): string {
  return join(directoryOf(root, source), 'index.json');
}

function metaFileOf(root: string, source: IndexSourceSpec): string {
  return join(directoryOf(root, source), 'meta.json');
}

function repoOf(root: string, source: IndexSourceSpec): string {
  return join(directoryOf(root, source), 'repo.git');
}

function writeMeta(path: string, meta: { readonly fetchedAt: number; readonly commit?: string }): Promise<void> {
  return writeFileAtomic(path, `${JSON.stringify(meta, null, 2)}\n`);
}

function readMeta(path: string): { readonly fetchedAt: number; readonly commit?: string } | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { fetchedAt?: unknown; commit?: unknown };
    if (typeof parsed.fetchedAt !== 'number') return undefined;
    return {
      fetchedAt: parsed.fetchedAt,
      ...(typeof parsed.commit === 'string' ? { commit: parsed.commit } : {}),
    };
  } catch {
    return undefined;
  }
}

function readCached(root: string, source: IndexSourceSpec): CachedIndex | undefined {
  let text: string;
  try {
    text = readFileSync(indexFileOf(root, source), 'utf8');
  } catch {
    return undefined;
  }
  const meta = readMeta(metaFileOf(root, source));
  if (meta === undefined) return undefined;
  const parsed = parseMarketIndexJson(text);
  if (!parsed.ok) return undefined;
  return {
    index: parsed.index,
    fetchedAt: meta.fetchedAt,
    ...(meta.commit === undefined ? {} : { commit: meta.commit }),
  };
}

function httpProblemOf(url: string): DiscoverProblem | undefined {
  const bad = httpUrlProblem(url);
  return bad === undefined ? undefined : { kind: 'http-url', detail: bad };
}

function gitProblemOf(source: MarketSourceConfig): DiscoverProblem | undefined {
  if (!gitUrlOk(source.url)) {
    return { kind: 'git-network', detail: 'git 地址不合格（只收 https / ssh / scp 形式，且不能带凭据）' };
  }
  return undefined;
}

function tail(text: string): string {
  const lines = withoutAskpassNoise(text)
    .split('\n')
    .filter((line) => line !== '');
  return lines.slice(-3).join(' ');
}

function classifyGitError(stderr: string, timedOut: boolean): DiscoverProblem {
  if (timedOut) return { kind: 'timeout', detail: 'git 拉取超时' };
  const text = stderr.toLowerCase();
  if (/couldn'?t find remote ref\s+["']?head/.test(text) || /could not find remote ref\s+["']?head/.test(text)) {
    return { kind: 'git-empty', detail: '仓库还没有任何提交' };
  }
  if (/couldn'?t find remote ref|could not find remote ref|not found in upstream origin/.test(text)) {
    return { kind: 'git-file', detail: '这个分支在仓库里不存在' };
  }
  if (text.includes('permission denied') || text.includes('authentication failed') || text.includes('could not read username')) {
    return { kind: 'git-auth', detail: tail(stderr) };
  }
  if (text.includes('does not exist') || text.includes('exists on disk, but not in')) {
    return { kind: 'git-file', detail: tail(stderr) };
  }
  return { kind: 'git-network', detail: tail(stderr) };
}

export function createMarketIndexReader(options: MarketIndexReaderOptions): MarketIndexReader {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const inFlight = new Map<string, Promise<IndexRead>>();

  async function readHttp(source: MarketSourceConfig): Promise<IndexRead> {
    const bad = httpProblemOf(source.url);
    if (bad !== undefined) return { ok: false, problem: bad };
    let response: Response;
    try {
      response = await fetchImpl(source.url, {
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return {
        ok: false,
        problem: timedOut
          ? { kind: 'timeout', detail: `拉索引超过 ${String(Math.round(timeoutMs / 1000))} 秒` }
          : { kind: 'http-network', detail: messageOf(error) },
      };
    }
    if (!response.ok) {
      return { ok: false, problem: { kind: 'http-status', detail: `HTTP ${String(response.status)}` } };
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      return { ok: false, problem: { kind: 'format', detail: `索引超过 ${String(Math.round(maxBytes / 1024))} KiB` } };
    }
    const parsed = parseMarketIndexJson(text);
    if (!parsed.ok) {
      return {
        ok: false,
        problem: { kind: 'format', detail: parsed.problems.map((one) => one.detail).join('；') },
      };
    }
    const fetchedAt = now();
    mkdirSync(directoryOf(options.root, source), { recursive: true });
    await writeFileAtomic(indexFileOf(options.root, source), text);
    await writeMeta(metaFileOf(options.root, source), { fetchedAt });
    return { ok: true, index: parsed.index, fetchedAt };
  }

  type RunResult = { ok: true; stdout: string } | { ok: false; problem: DiscoverProblem; stderr?: string };

  async function run(line: string): Promise<RunResult> {
    const shell = options.shell;
    if (shell === undefined) return { ok: false, problem: { kind: 'git-missing', detail: '没有执行缝，读不了 git 索引' } };
    try {
      const result = await runShell(shell, `${gitNoPromptPrefix()} ${line}`, { timeoutMs });
      if (result.exitCode !== 0) {
        return { ok: false, problem: classifyGitError(result.stderr, result.timedOut), stderr: result.stderr };
      }
      return { ok: true, stdout: result.stdout };
    } catch (error) {
      const text = messageOf(error);
      if (/not found|no such file|ENOENT/i.test(text)) {
        return { ok: false, problem: { kind: 'git-missing', detail: text } };
      }
      return { ok: false, problem: { kind: 'git-network', detail: text } };
    }
  }

  async function branchOf(repo: string): Promise<string | undefined> {
    const result = await run(`git -C ${quoteShellArg(repo)} symbolic-ref --short HEAD`);
    const branch = result.ok ? result.stdout.trim() : '';
    return branch === '' ? undefined : branch;
  }

  async function withBranch(failed: Extract<RunResult, { ok: false }>, repo: string): Promise<IndexRead> {
    if (failed.problem.kind !== 'git-empty' && failed.problem.kind !== 'git-missing-index') return failed;
    const branch = await branchOf(repo);
    return {
      ok: false,
      problem: { ...failed.problem, ...(branch === undefined ? {} : { branch }) },
    };
  }

  async function readGit(source: MarketSourceConfig): Promise<IndexRead> {
    const bad = gitProblemOf(source);
    if (bad !== undefined) return { ok: false, problem: bad };
    if (options.shell === undefined) {
      return { ok: false, problem: { kind: 'git-missing', detail: '没有 git 执行缝' } };
    }
    const repo = repoOf(options.root, source);
    const path = (source.path ?? 'market.json').replace(/^\/+/, '');
    const ref = (source.ref ?? '').trim();
    let revision = 'FETCH_HEAD';
    mkdirSync(directoryOf(options.root, source), { recursive: true });
    if (!existsSync(repo)) {
      const branch = ref === '' ? '' : `--branch ${quoteShellArg(ref)} `;
      const cloned = await run(
        `git clone --bare --depth 1 ${branch}${quoteShellArg(source.url)} ${quoteShellArg(repo)}`,
      );
      if (!cloned.ok) {
        rmSync(repo, { recursive: true, force: true });
        return cloned;
      }
      revision = 'HEAD';
    } else {
      const fetched = await run(
        `git -C ${quoteShellArg(repo)} fetch --depth 1 origin ${quoteShellArg(ref === '' ? 'HEAD' : ref)}`,
      );
      if (!fetched.ok) return withBranch(fetched, repo);
    }
    const exists = await run(`git -C ${quoteShellArg(repo)} rev-parse --verify HEAD`);
    if (!exists.ok) {
      return withBranch(
        { ok: false, problem: { kind: 'git-empty', detail: '仓库还没有任何提交' } },
        repo,
      );
    }
    const shown = await run(`git -C ${quoteShellArg(repo)} show ${revision}:${quoteShellArg(path)}`);
    if (!shown.ok) {
      if (shown.problem.kind === 'git-file') {
        return withBranch(
          { ok: false, problem: { kind: 'git-missing-index', detail: `索引文件 ${path} 不在仓库里` } },
          repo,
        );
      }
      return shown;
    }
    const head = await run(`git -C ${quoteShellArg(repo)} rev-parse ${revision}`);
    if (!head.ok) return head;
    const commit = head.stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(commit)) {
      return { ok: false, problem: { kind: 'git-file', detail: `读到的 commit 不是 40 位：${commit}` } };
    }
    const parsed = parseMarketIndexJson(shown.stdout);
    if (!parsed.ok) {
      return {
        ok: false,
        problem: { kind: 'format', detail: parsed.problems.map((one) => one.detail).join('；') },
      };
    }
    const fetchedAt = now();
    await writeFileAtomic(indexFileOf(options.root, source), shown.stdout);
    await writeMeta(metaFileOf(options.root, source), { fetchedAt, commit });
    return { ok: true, index: parsed.index, fetchedAt, commit };
  }

  async function read(source: MarketSourceConfig, callOptions: { readonly force?: boolean } = {}): Promise<IndexRead> {
    const key = marketSourceKey(source);
    const cached = readCached(options.root, source);
    if (callOptions.force !== true && cached !== undefined && now() - cached.fetchedAt < ttlMs) {
      return { ok: true, ...cached };
    }
    const running = inFlight.get(key);
    if (running !== undefined) return running;
    const promise = (source.kind === 'http' ? readHttp(source) : readGit(source))
      .catch((error: unknown) => ({
        ok: false as const,
        problem: { kind: 'unknown' as const, detail: messageOf(error) },
      }))
      .then((result) => {
        if (result.ok) return result;
        return { ...result, ...(cached === undefined ? {} : { cached }) };
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, promise);
    return promise;
  }

  return {
    read,
    cached: (source) => readCached(options.root, source),
    pathOf: (source) => directoryOf(options.root, source),
  };
}
