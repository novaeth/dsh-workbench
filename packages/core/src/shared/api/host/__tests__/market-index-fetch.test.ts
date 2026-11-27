import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import { marketSourceKey, parseSourceConfig } from '@dsh-workbench/shared/host';
import type { GitRunner } from '../git-process';
import { createMarketIndexReader } from '../market-index-fetch';
import { createMarketSourcesStore } from '../market-sources-store';

const INDEX = {
  format: 1,
  plugins: [
    {
      name: '@scope/module-x',
      versions: [{ version: '0.1.0', source: { type: 'npm' } }],
      metadata: { labels: ['workbench'] },
    },
  ],
};

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'wb-market-index-'));
}

function httpSource(): MarketSourceConfig {
  return { id: 'team', label: '团队', kind: 'http', url: 'https://market.company.com/market.json' };
}

function gitSource(): MarketSourceConfig {
  return { id: 'team', label: '团队', kind: 'git', url: 'https://git.company.com/wb/market.git', ref: 'main' };
}

function responseOf(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response;
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

describe('createMarketIndexReader', () => {
  it('http 源读一次就进缓存，TTL 内不再发请求', async () => {
    const root = tempRoot();
    let calls = 0;
    const reader = createMarketIndexReader({
      root,
      now: () => 1000,
      fetchImpl: async () => {
        calls += 1;
        return responseOf(JSON.stringify(INDEX));
      },
    });
    const first = await reader.read(httpSource());
    expect(first.ok).toBe(true);
    const second = await reader.read(httpSource());
    expect(second.ok).toBe(true);
    expect(calls).toBe(1);
    await reader.read(httpSource(), { force: true });
    expect(calls).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it('拉不到时退回上次合格的缓存并标 stale', async () => {
    const root = tempRoot();
    let fail = false;
    const reader = createMarketIndexReader({
      root,
      now: () => 1000,
      fetchImpl: async () => {
        if (fail) throw new Error('network down');
        return responseOf(JSON.stringify(INDEX));
      },
    });
    expect((await reader.read(httpSource())).ok).toBe(true);
    fail = true;
    const outcome = await reader.read(httpSource(), { force: true });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.kind).toBe('http-network');
    expect(outcome.cached?.index.plugins[0]?.name).toBe('@scope/module-x');
    rmSync(root, { recursive: true, force: true });
  });

  it('索引不合格整份拒，不覆盖旧缓存', async () => {
    const root = tempRoot();
    const reader = createMarketIndexReader({
      root,
      now: () => 1000,
      fetchImpl: async () => responseOf(JSON.stringify({ format: 1, plugins: [{ name: 'Bad Name', versions: [] }] })),
    });
    const outcome = await reader.read(httpSource());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.kind).toBe('format');
    rmSync(root, { recursive: true, force: true });
  });

  it('git 源走 bare clone + ls-tree + 逐条目 show，记下 commit', async () => {
    const root = tempRoot();
    const commit = 'a'.repeat(40);
    const doc = {
      name: '@scope/module-x',
      metadata: { labels: ['workbench'] },
      versions: [{ version: '0.1.0', source: { type: 'npm' }, publishTimestamp: 1_760_000_000 }],
    };
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'ls-tree') {
        return {
          exitCode: 0,
          stdout: `100644 blob ${'c'.repeat(40)}\tmarket/@scope/module-x.json\n100644 blob ${'d'.repeat(40)}\tmarket/README.md\n`,
        };
      }
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${commit}\n` };
      if (args[0] === 'fetch') return { exitCode: 0 };
      return { exitCode: 0, stdout: JSON.stringify(doc) };
    });
    const reader = createMarketIndexReader({ root, runGit: fake.runGit, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.commit).toBe(commit);
    expect(outcome.index.plugins[0]?.name).toBe('@scope/module-x');
    expect(outcome.index.plugins[0]?.versions).toEqual([
      { version: '0.1.0', source: { type: 'npm' }, publishTimestamp: 1_760_000_000 },
    ]);
    expect(fake.calls[0]?.args.slice(0, 6)).toEqual(['clone', '--bare', '--depth', '1', '--branch', 'main']);
    expect(fake.calls[0]?.args[6]).toBe('https://git.company.com/wb/market.git');
    expect(fake.calls[0]?.args[7]).toContain('repo.git');
    expect(fake.calls.some((one) => one.args[0] === 'ls-tree' && one.args.includes(commit))).toBe(true);
    expect(
      fake.calls.some(
        (one) => one.args[0] === 'show' && one.args[1] === `${commit}:market/@scope/module-x.json`,
      ),
    ).toBe(true);
    expect(fake.calls.every((one) => one.args[0] === 'clone' || one.cwd !== undefined)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('★ 配置里用反斜杠写的索引目录（win32 粘过来的），走 git 时是 `/`', async () => {
    const root = tempRoot();
    const commit = 'a'.repeat(40);
    const parsed = parseSourceConfig({
      id: 'team',
      label: '团队',
      kind: 'git',
      url: 'https://git.company.com/wb/market.git',
      ref: 'main',
      path: 'docs\\market',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const entry = {
      name: '@scope/module-x',
      metadata: { labels: ['workbench'] },
      versions: [{ version: '0.1.0', source: { type: 'npm' }, publishTimestamp: 1_760_000_000 }],
    };
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'ls-tree') {
        return { exitCode: 0, stdout: `100644 blob ${'c'.repeat(40)}\tdocs/market/plain.json\n` };
      }
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${commit}\n` };
      if (args[0] === 'fetch') return { exitCode: 0 };
      return { exitCode: 0, stdout: JSON.stringify(entry) };
    });
    const reader = createMarketIndexReader({ root, runGit: fake.runGit, now: () => 1000 });
    const outcome = await reader.read(parsed.source);
    expect(outcome.ok).toBe(true);
    const listed = fake.calls.find((one) => one.args[0] === 'ls-tree');
    expect(listed?.args).toContain('docs/market');
    expect(listed?.args.some((one) => one.includes('\\'))).toBe(false);
    expect(
      fake.calls.some((one) => one.args[0] === 'show' && one.args[1] === `${commit}:docs/market/plain.json`),
    ).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('git 写不进缓存时单独报 sandbox，而不是网络错误', async () => {
    const root = tempRoot();
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') {
        return {
          exitCode: 128,
          stderr:
            "Cloning into bare repository 'repo.git'...\nfatal: could not create work tree dir: Operation not permitted",
        };
      }
      return { exitCode: 0 };
    });
    const reader = createMarketIndexReader({ root, runGit: fake.runGit, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.kind).toBe('sandbox');
    expect(outcome.problem.detail).toContain('可写根');
    rmSync(root, { recursive: true, force: true });
  });

  it('老仓库只有 market.json（没有条目目录）时按单文件读，不报缺索引', async () => {
    const root = tempRoot();
    const commit = 'e'.repeat(40);
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'ls-tree') return { exitCode: 0, stdout: '' };
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${commit}\n` };
      if (args[0] === 'show') return { exitCode: 0, stdout: JSON.stringify(INDEX) };
      return { exitCode: 0 };
    });
    const reader = createMarketIndexReader({ root, runGit: fake.runGit, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.index.plugins[0]?.name).toBe('@scope/module-x');
    expect(fake.calls.some((one) => one.args[0] === 'show' && one.args[1] === `${commit}:market.json`)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('空仓库报 git-empty，并带上仓库默认分支', async () => {
    const root = tempRoot();
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'symbolic-ref') return { exitCode: 0, stdout: 'trunk\n' };
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        return { exitCode: 128, stderr: 'fatal: Needed a single revision' };
      }
      return { exitCode: 0 };
    });
    const reader = createMarketIndexReader({ root, runGit: fake.runGit, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.kind).toBe('git-empty');
    expect(outcome.problem.branch).toBe('trunk');
    rmSync(root, { recursive: true, force: true });
  });

  it('仓库有提交但既没有条目目录也没有 market.json 时报 git-missing-index', async () => {
    const root = tempRoot();
    const commit = 'b'.repeat(40);
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'symbolic-ref') return { exitCode: 0, stdout: 'main\n' };
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${commit}\n` };
      if (args[0] === 'ls-tree') return { exitCode: 0, stdout: '' };
      if (args[0] === 'show') {
        return { exitCode: 1, stderr: "fatal: path 'market.json' does not exist in 'HEAD'" };
      }
      return { exitCode: 0 };
    });
    const reader = createMarketIndexReader({ root, runGit: fake.runGit, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.kind).toBe('git-missing-index');
    expect(outcome.problem.branch).toBe('main');
    rmSync(root, { recursive: true, force: true });
  });

  describe('缓存仓库里残留的锁', () => {
    const NOW = 1_700_000_000_000;

    function lockOf(root: string, source: MarketSourceConfig, ageMs: number): { repo: string; lock: string } {
      const repo = join(root, 'market-index', marketSourceKey(source), 'repo.git');
      mkdirSync(repo, { recursive: true });
      const lock = join(repo, 'shallow.lock');
      writeFileSync(lock, 'sha\n', 'utf8');
      const stamp = new Date(NOW - ageMs);
      utimesSync(lock, stamp, stamp);
      return { repo, lock };
    }

    const entry = {
      name: '@scope/module-x',
      metadata: { labels: ['workbench'] },
      versions: [{ version: '0.1.0', source: { type: 'npm' }, publishTimestamp: 1_760_000_000 }],
    };

    function lockGit(commit: string, lockMessage: (fetches: number) => string | undefined) {
      let fetches = 0;
      const runGit: GitRunner = async (args) => {
        const fail = args[0] === 'fetch' ? lockMessage(++fetches) : undefined;
        if (fail !== undefined) return { exitCode: 128, stdout: '', stderr: fail, timedOut: false };
        if (args[0] === 'ls-tree') {
          return {
            exitCode: 0,
            stdout: `100644 blob ${'c'.repeat(40)}\tmarket/@scope/module-x.json\n`,
            stderr: '',
            timedOut: false,
          };
        }
        if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${commit}\n`, stderr: '', timedOut: false };
        if (args[0] === 'show') return { exitCode: 0, stdout: JSON.stringify(entry), stderr: '', timedOut: false };
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
      };
      return { runGit, fetches: () => fetches };
    }

    it('★ fetch 撞上残留的 shallow.lock：清掉锁重试一次就成功', async () => {
      const root = tempRoot();
      const source = gitSource();
      const { lock } = lockOf(root, source, 60_000);
      const git = lockGit('f'.repeat(40), (fetches) =>
        fetches === 1 ? `fatal: Unable to create '${lock}': File exists.` : undefined,
      );
      const reader = createMarketIndexReader({ root, runGit: git.runGit, now: () => NOW });
      const outcome = await reader.read(source);
      expect(outcome.ok).toBe(true);
      expect(git.fetches()).toBe(2);
      expect(existsSync(lock)).toBe(false);
      rmSync(root, { recursive: true, force: true });
    });

    it('锁还新鲜时不当残留，原样报错也不删别人的锁', async () => {
      const root = tempRoot();
      const source = gitSource();
      const { lock } = lockOf(root, source, 1_000);
      const git = lockGit('f'.repeat(40), () => `fatal: Unable to create '${lock}': File exists.`);
      const reader = createMarketIndexReader({ root, runGit: git.runGit, now: () => NOW });
      const outcome = await reader.read(source);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.problem.kind).toBe('git-network');
      expect(git.fetches()).toBe(1);
      expect(existsSync(lock)).toBe(true);
      rmSync(root, { recursive: true, force: true });
    });

    it('锁在缓存仓库外面时不去碰它', async () => {
      const root = tempRoot();
      const source = gitSource();
      lockOf(root, source, 60_000);
      const outside = join(root, 'somewhere.lock');
      writeFileSync(outside, '', 'utf8');
      const stamp = new Date(NOW - 60_000);
      utimesSync(outside, stamp, stamp);
      const git = lockGit('f'.repeat(40), () => `fatal: Unable to create '${outside}': File exists.`);
      const reader = createMarketIndexReader({ root, runGit: git.runGit, now: () => NOW });
      const outcome = await reader.read(source);
      expect(outcome.ok).toBe(false);
      expect(existsSync(outside)).toBe(true);
      rmSync(root, { recursive: true, force: true });
    });
  });

  it('git 跑不起来时报 git-missing', async () => {
    const root = tempRoot();
    const runGit: GitRunner = async () => {
      throw new Error('spawn git ENOENT');
    };
    const reader = createMarketIndexReader({ root, runGit, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.kind).toBe('git-missing');
    rmSync(root, { recursive: true, force: true });
  });
});

describe('createMarketSourcesStore', () => {
  it('空目录读回空列表，保存后自动选中', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    expect(store.read()).toEqual({ sources: [], selected: null, transports: {} });
    const saved = await store.apply({ action: 'save', source: httpSource() });
    expect(saved.sources).toHaveLength(1);
    expect(saved.selected).toBe('team');
    rmSync(root, { recursive: true, force: true });
  });

  it('删掉选中项后自动落到下一个', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: httpSource() });
    await store.apply({ action: 'save', source: { ...gitSource(), id: 'mirror' } });
    const removed = await store.apply({ action: 'remove', id: 'team' });
    expect(removed.selected).toBe('mirror');
    rmSync(root, { recursive: true, force: true });
  });

  it('不合格的源拒写', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await expect(
      store.apply({ action: 'save', source: { ...httpSource(), url: 'file:///etc/passwd' } }),
    ).rejects.toThrow(/http/);
    rmSync(root, { recursive: true, force: true });
  });

  it('读的时候丢掉坏条目', () => {
    const root = tempRoot();
    mkdirSync(join(root, 'market-index'), { recursive: true });
    writeFileSync(join(root, 'market-index', 'sources.json'), '{"sources":[{"id":"bad"}],"selected":"bad"}', {
      encoding: 'utf8',
      flag: 'w',
    });
    const store = createMarketSourcesStore({ root });
    expect(store.read()).toEqual({ sources: [], selected: null, transports: {} });
    rmSync(root, { recursive: true, force: true });
  });
});
