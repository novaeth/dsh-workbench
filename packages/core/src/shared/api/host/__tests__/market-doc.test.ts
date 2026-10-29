import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { GitRunner } from '../git-process';
import { createMarketDocReader } from '../market-doc';

const COMMIT = 'a'.repeat(40);

function gitSource(): MarketSourceConfig {
  return { id: 'team', label: '团队', kind: 'git', url: 'https://git.company.com/wb/market.git' };
}

interface GitCall {
  readonly args: readonly string[];
  readonly cwd?: string;
}

function fakeGit(reply: (args: readonly string[]) => { exitCode: number; stdout?: string; stderr?: string }) {
  const calls: GitCall[] = [];
  const runGit: GitRunner = async (args, options = {}) => {
    calls.push({ args, ...(options.cwd === undefined ? {} : { cwd: options.cwd }) });
    const outcome = reply(args);
    return {
      exitCode: outcome.exitCode,
      stdout: outcome.stdout ?? '',
      stderr: outcome.stderr ?? '',
      timedOut: false,
    };
  };
  return { runGit, calls };
}

function responseOf(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('createMarketDocReader：git 源从索引仓库的产物目录里读', () => {
  it('读 <commit>:<path>/CHANGELOG.md，并按 commit + 路径缓存', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-market-doc-'));
    const fake = fakeGit((args) => {
      expect(args[0]).toBe('show');
      expect(args[1]).toContain(`${COMMIT}:`);
      expect(args[1]).toContain('CHANGELOG.md');
      return { exitCode: 0, stdout: '### ✨ 新增\n\n- 一条\n' };
    });
    try {
      const reader = createMarketDocReader({ root, runGit: fake.runGit });
      const target = {
        name: '@demo/probe',
        version: '0.1.0',
        source: { type: 'git' as const, url: gitSource().url, commit: COMMIT, path: 'packages/probe' },
      };
      const first = await reader.read(gitSource(), target, 'changelog');
      expect(first).toEqual({ ok: true, kind: 'changelog', version: '0.1.0', text: '### ✨ 新增\n\n- 一条\n' });
      await reader.read(gitSource(), target, 'changelog');
      expect(fake.calls.filter((one) => one.args[0] === 'show')).toHaveLength(1);
      expect(fake.calls[0]?.cwd).toContain('repo.git');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('★ 本地浅克隆里没有那个产物 commit（发布刚推上去）→ 按 commit 取回来再读，不把整页判成没有内容', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-market-doc-'));
    let fetched = false;
    const fake = fakeGit((args) => {
      if (args[0] === 'show') {
        if (!fetched) {
          return { exitCode: 128, stderr: `fatal: path 'packages/probe/README.md' does not exist in '${COMMIT}'` };
        }
        return { exitCode: 0, stdout: '# 说明\n' };
      }
      if (args[0] === 'cat-file') return { exitCode: fetched ? 0 : 1 };
      if (args[0] === 'fetch') {
        fetched = true;
        return { exitCode: 0 };
      }
      return { exitCode: 1, stderr: `unexpected: ${args.join(' ')}` };
    });
    try {
      const reader = createMarketDocReader({ root, runGit: fake.runGit });
      const target = {
        name: '@demo/probe',
        version: '0.1.0',
        source: { type: 'git' as const, url: gitSource().url, commit: COMMIT, path: 'packages/probe' },
      };

      expect(await reader.read(gitSource(), target, 'readme')).toEqual({
        ok: true,
        kind: 'readme',
        version: '0.1.0',
        text: '# 说明\n',
      });
      expect(fake.calls.filter((one) => one.args[0] === 'fetch')).toHaveLength(1);
      expect(fake.calls.map((one) => one.args.join(' ')).join('\n')).toContain(COMMIT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('产物里没有这个文件 → missing；读不到仓库 → unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-market-doc-'));
    const missing = fakeGit(() => ({
      exitCode: 1,
      stderr: `fatal: path 'packages/probe/README.md' does not exist in '${COMMIT}'`,
    }));
    const broken = fakeGit(() => ({ exitCode: 1, stderr: 'fatal: not a git repository' }));
    try {
      const target = {
        name: '@demo/probe',
        version: '0.1.0',
        source: { type: 'git' as const, url: gitSource().url, commit: COMMIT, path: 'packages/probe' },
      };
      const reader = createMarketDocReader({ root, runGit: missing.runGit });
      expect(await reader.read(gitSource(), target, 'readme')).toEqual({
        ok: false,
        kind: 'readme',
        version: '0.1.0',
        reason: 'missing',
      });
      const other = createMarketDocReader({ root, runGit: broken.runGit });
      const failed = await other.read(gitSource(), target, 'changelog');
      expect(failed.ok).toBe(false);
      if (failed.ok) return;
      expect(failed.reason).toBe('unavailable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('读失败不记进缓存：下一次还会再试一次（浅克隆/网络这类毛病能自己好，不用重启）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-market-doc-'));
    let attempt = 0;
    const flaky = fakeGit(() => {
      attempt += 1;
      return attempt <= 3
        ? { exitCode: 128, stderr: 'fatal: not a git repository' }
        : { exitCode: 0, stdout: '# 说明\n' };
    });
    try {
      const target = {
        name: '@demo/probe',
        version: '0.1.0',
        source: { type: 'git' as const, url: gitSource().url, commit: COMMIT, path: 'packages/probe' },
      };
      const reader = createMarketDocReader({ root, runGit: flaky.runGit });
      const first = await reader.read(gitSource(), target, 'readme');
      expect(first.ok).toBe(false);
      expect(await reader.read(gitSource(), target, 'readme')).toEqual({
        ok: true,
        kind: 'readme',
        version: '0.1.0',
        text: '# 说明\n',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('createMarketDocReader：npm 源只有说明（readme），没有更新日志', () => {
  it('从 packument 里按版本取 readme；changelog 直接 missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-market-doc-'));
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return responseOf({ versions: { '0.1.0': { readme: '# npm 说明' } } });
    }) as unknown as (url: string, init: RequestInit) => Promise<Response>;
    try {
      const reader = createMarketDocReader({ root, fetchImpl });
      const source = { id: 'npm', label: 'npm', kind: 'http' as const, url: 'https://example.com/market.json' };
      const target = {
        name: '@demo/probe',
        version: '0.1.0',
        source: { type: 'npm' as const, registry: 'https://npm.demo.test/' },
      };
      expect(await reader.read(source, target, 'readme')).toEqual({
        ok: true,
        kind: 'readme',
        version: '0.1.0',
        text: '# npm 说明',
      });
      expect(urls).toEqual(['https://npm.demo.test/@demo%2fprobe']);
      expect(await reader.read(source, target, 'changelog')).toEqual({
        ok: false,
        kind: 'changelog',
        version: '0.1.0',
        reason: 'missing',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('超过上限的文档截断到上限，不把整份塞给界面', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-market-doc-'));
    const fetchImpl = (async () => responseOf({ readme: 'x'.repeat(64) })) as unknown as (
      url: string,
      init: RequestInit,
    ) => Promise<Response>;
    try {
      const reader = createMarketDocReader({ root, fetchImpl, maxBytes: 16 });
      const doc = await reader.read(
        { id: 'npm', label: 'npm', kind: 'http', url: 'https://example.com/market.json' },
        { name: 'probe', version: '0.1.0', source: { type: 'npm' } },
        'readme',
      );
      expect(doc.ok).toBe(true);
      if (!doc.ok) return;
      expect(Buffer.byteLength(doc.text)).toBeLessThanOrEqual(16);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
