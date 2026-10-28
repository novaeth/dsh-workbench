import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_INDEX_DIR } from '@dsh-workbench/shared/contract/protocol/market-index';
import {
  MARKET_ENTRIES_README_LINES,
  MARKET_INDEX_README_LINES,
  gitUrlOk,
  marketEntryFilesOfLegacy,
  marketBranchOk,
  marketSourceKey,
  quoteShellArg,
  runShell,
  tailLines,
} from '@dsh-workbench/shared/host';
import type { MarketSourcesStore } from './market-sources-store';

export interface MarketSourceInitRequest {
  readonly id: string;
  readonly ref?: string;
  readonly stampOnly?: boolean;
}

export interface MarketSourceInitResult {
  readonly source: MarketSourceConfig;
  readonly branch: string;
  readonly commit: string;
  readonly created: readonly string[];
  readonly changed: boolean;
}

export type MarketSourceInitializer = (request: MarketSourceInitRequest) => Promise<MarketSourceInitResult>;

export interface MarketSourceInitOptions {
  readonly root: string;
  readonly store: MarketSourcesStore;
  readonly shell?: DshShell | undefined;
  readonly timeoutMs?: number | undefined;
}

const DEFAULT_TIMEOUT_MS = 120 * 1000;
const CACHE_FILES = ['repo.git', 'index.json', 'meta.json'];

export function createMarketSourceInitializer(options: MarketSourceInitOptions): MarketSourceInitializer {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function forget(source: MarketSourceConfig, next: MarketSourceConfig): void {
    const base = join(options.root, 'market-index');
    const oldKey = marketSourceKey(source);
    const nextKey = marketSourceKey(next);
    if (oldKey !== nextKey) {
      const worktree = join(base, oldKey, 'worktree');
      const target = join(base, nextKey, 'worktree');
      if (existsSync(worktree) && !existsSync(target)) {
        mkdirSync(join(base, nextKey), { recursive: true });
        renameSync(worktree, target);
      }
      rmSync(join(base, oldKey), { recursive: true, force: true });
    }
    for (const name of CACHE_FILES) {
      rmSync(join(base, nextKey, name), { recursive: true, force: true });
    }
  }

  return async (request) => {
    const shell = options.shell;
    if (shell === undefined) throw new Error('这台机器上没有 shell 服务，初始化不了索引仓库');
    const source = options.store.read().sources.find((one) => one.id === request.id);
    if (source === undefined) throw new Error('这个索引源已经不在了 —— 刷新后再试');
    if (source.kind !== 'git') throw new Error('只有 git 仓库能初始化成市场索引');
    if (!gitUrlOk(source.url)) throw new Error(`这个 git 地址不合格：${source.url}`);
    const asked = (request.ref ?? '').trim();
    if (asked !== '' && !marketBranchOk(asked)) throw new Error(`分支名不合格：${asked}`);

    const git = (argv: readonly string[], workdir?: string) =>
      runShell(shell, ['git', argv[0], ...argv.slice(1).map((one) => quoteShellArg(one))].join(' '), {
        ...(workdir === undefined ? {} : { workdir }),
        timeoutMs,
      });
    const workdir = join(options.root, 'market-index', marketSourceKey(source), 'worktree');
    mkdirSync(dirname(workdir), { recursive: true });
    if (!existsSync(join(workdir, '.git'))) {
      const cloned = await git(['clone', source.url, workdir]);
      if (cloned.exitCode !== 0) {
        rmSync(workdir, { recursive: true, force: true });
        throw new Error(`索引仓库克隆不下来：${tailLines(cloned.stderr || cloned.stdout, 4)}`);
      }
    }

    const status = await git(['status', '--porcelain', '--untracked-files=all'], workdir);
    if (status.exitCode !== 0) throw new Error(`读不了本地副本状态：${tailLines(status.stderr, 4)}`);
    const dirty = status.stdout.trim();
    if (dirty !== '') {
      throw new Error(`本地副本还有未提交改动（${dirty.split('\n').slice(0, 3).join('、')}）—— 先处理再初始化`);
    }

    const head = await git(['rev-parse', '--verify', 'HEAD'], workdir);
    let branch: string;
    if (head.exitCode === 0) {
      const current = await git(['rev-parse', '--abbrev-ref', 'HEAD'], workdir);
      const name = current.exitCode === 0 ? current.stdout.trim() : '';
      if (name === '' || name === 'HEAD') throw new Error('索引仓库不在一个分支上（detached HEAD）—— 切回分支再初始化');
      if (asked !== '' && asked !== name) {
        const switched = await git(['checkout', asked], workdir);
        if (switched.exitCode !== 0) throw new Error(`这个仓库没有分支 ${asked}（当前 ${name}）`);
        branch = asked;
      } else {
        branch = name;
      }
    } else {
      const symref = await git(['symbolic-ref', '--short', 'HEAD'], workdir);
      const fallback = symref.exitCode === 0 ? symref.stdout.trim() : '';
      branch = asked !== '' ? asked : fallback === '' ? 'main' : fallback;
      const created = await git(['checkout', '-B', branch], workdir);
      if (created.exitCode !== 0) throw new Error(`建分支 ${branch} 没过：${tailLines(created.stderr, 4)}`);
    }

    const indexPath = ((source.path ?? MARKET_INDEX_DIR).replace(/^\/+/, '') || MARKET_INDEX_DIR).replace(/\/+$/, '');
    const indexDir = join(workdir, indexPath);
    const indexMarker = join(indexDir, 'README.md');
    const stampOnly = request.stampOnly === true;
    if (stampOnly && !existsSync(indexDir)) {
      throw new Error(`仓库里还没有 ${indexPath}/ —— 先选中这个源，按发现页的提示把它初始化成索引`);
    }
    const written: string[] = [];
    if (!stampOnly) {
      const legacyFile = join(workdir, 'market.json');
      if (indexPath !== 'market.json' && existsSync(legacyFile)) {
        const migrated = marketEntryFilesOfLegacy(readFileSync(legacyFile, 'utf8'), indexPath);
        if (migrated !== undefined) {
          for (const file of migrated) {
            const target = join(workdir, ...file.path.split('/'));
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, file.text);
            written.push(file.path);
          }
          rmSync(legacyFile);
          written.push('market.json');
        }
      }
      if (!existsSync(indexMarker)) {
        mkdirSync(indexDir, { recursive: true });
        writeFileSync(indexMarker, MARKET_ENTRIES_README_LINES.join('\n'));
        written.push(`${indexPath}/README.md`);
      }
      const readmeFile = join(workdir, 'README.md');
      if (!existsSync(readmeFile)) {
        writeFileSync(readmeFile, MARKET_INDEX_README_LINES.join('\n'));
        written.push('README.md');
      }
    }

    if (written.length > 0) {
      const added = await git(['add', ...written], workdir);
      if (added.exitCode !== 0) throw new Error(`git add 没过：${tailLines(added.stderr, 4)}`);
      const committed = await git(['commit', '-m', 'chore: init market index'], workdir);
      if (committed.exitCode !== 0) throw new Error(`git commit 没过：${tailLines(committed.stderr, 4)}`);
      const pushed = await git(['push', 'origin', `HEAD:refs/heads/${branch}`], workdir);
      if (pushed.exitCode !== 0) {
        throw new Error(`初始化提交推不上去（分支保护或权限）：${tailLines(pushed.stderr, 4)}`);
      }
    }
    const revision = await git(['rev-parse', 'HEAD'], workdir);
    const commit = revision.exitCode === 0 ? revision.stdout.trim() : '';

    const next: MarketSourceConfig = { ...source, policy: 'artifacts-in-repo', ref: branch };
    await options.store.apply({ action: 'save', source: next });
    forget(source, next);
    return { source: next, branch, commit, created: written, changed: written.length > 0 };
  };
}
