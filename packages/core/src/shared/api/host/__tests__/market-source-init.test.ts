import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import { marketSourceKey } from '@dsh-workbench/shared/host';
import type { GitRunner } from '../git-process';
import { createMarketSourceInitializer } from '../market-source-init';
import { createMarketSourcesStore } from '../market-sources-store';

const COMMIT = 'c'.repeat(40);

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'wb-market-init-'));
}

function gitSource(): MarketSourceConfig {
  return { id: 'team', label: '市场', kind: 'git', url: 'https://git.example.com/team/market.git' };
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

describe('createMarketSourceInitializer', () => {
  it('空仓库按仓库默认分支建索引、写 market/README.md + README、推首个 commit', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        return { exitCode: 128, stderr: 'fatal: Needed a single revision' };
      }
      if (args[0] === 'symbolic-ref') return { exitCode: 0, stdout: 'trunk\n' };
      if (args[0] === 'status') return { exitCode: 0 };
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${COMMIT}\n` };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    const result = await init({ id: 'team' });
    expect(result.branch).toBe('trunk');
    expect(result.commit).toBe(COMMIT);
    expect(result.changed).toBe(true);
    expect(result.created).toEqual(['market/README.md', 'README.md']);
    expect(result.source.ref).toBe('trunk');
    expect(result.source.policy).toBe('artifacts-in-repo');
    expect(store.read().sources[0]?.ref).toBe('trunk');
    const worktree = join(root, 'market-index', marketSourceKey(result.source), 'worktree');
    expect(existsSync(join(worktree, 'market', 'README.md'))).toBe(true);
    expect(existsSync(join(worktree, 'README.md'))).toBe(true);
    expect(fake.calls.filter((one) => one.args[0] === 'push').length).toBe(1);
    expect(fake.calls.every((one) => one.args[0] === 'clone' || one.cwd !== undefined)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('已有提交的仓库切到指定分支；初始化后清掉读取缓存', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const oldKey = marketSourceKey(gitSource());
    mkdirSync(join(root, 'market-index', oldKey, 'repo.git'), { recursive: true });
    writeFileSync(join(root, 'market-index', oldKey, 'index.json'), '{"format":1,"plugins":[]}');
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--verify') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { exitCode: 0, stdout: 'master\n' };
      if (args[0] === 'status') return { exitCode: 0 };
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${COMMIT}\n` };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    const result = await init({ id: 'team', ref: 'main' });
    expect(result.branch).toBe('main');
    expect(fake.calls.some((one) => one.args[0] === 'checkout' && one.args.includes('main'))).toBe(true);
    expect(existsSync(join(root, 'market-index', oldKey))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('本地副本不干净时不写任何东西', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') return { exitCode: 0 };
      if (args[0] === 'status') return { exitCode: 0, stdout: ' M market.json\n' };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    await expect(init({ id: 'team' })).rejects.toThrow(/未提交改动/);
    rmSync(root, { recursive: true, force: true });
  });

  it('分支名不合格直接拒，不碰仓库', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const fake = fakeGit(() => ({ exitCode: 0 }));
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    await expect(init({ id: 'team', ref: 'bad name' })).rejects.toThrow(/分支名/);
    expect(fake.calls).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it('http 源不能初始化', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({
      action: 'save',
      source: { id: 'web', label: 'web', kind: 'http', url: 'https://example.com/market.json' },
    });
    const fake = fakeGit(() => ({ exitCode: 0 }));
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    await expect(init({ id: 'web' })).rejects.toThrow(/git/);
    rmSync(root, { recursive: true, force: true });
  });

  it('克隆被系统拦住时说「被系统拦住了」，不再贴 git 原文', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const fake = fakeGit((args) => {
      if (args[0] === 'clone') {
        return { exitCode: 128, stderr: "fatal: could not create work tree dir: Operation not permitted" };
      }
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    await expect(init({ id: 'team' })).rejects.toThrow(/被系统拦住了/);
    rmSync(root, { recursive: true, force: true });
  });

  it('仓库里已有老 market.json：初始化时拆成条目文件并删掉它', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const worktree = join(root, 'market-index', marketSourceKey(gitSource()), 'worktree');
    mkdirSync(join(worktree, '.git'), { recursive: true });
    writeFileSync(
      join(worktree, 'market.json'),
      JSON.stringify({
        format: 1,
        plugins: [
          { name: '@scope/x', owner: '甲', versions: [{ version: '0.1.0', source: { type: 'npm' } }] },
        ],
      }),
    );
    const fake = fakeGit((args) => {
      if (args[0] === 'status') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--verify') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { exitCode: 0, stdout: 'main\n' };
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${COMMIT}\n` };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    const result = await init({ id: 'team' });
    expect(result.changed).toBe(true);
    const moved = join(root, 'market-index', marketSourceKey(result.source), 'worktree');
    expect(existsSync(join(moved, 'market.json'))).toBe(false);
    expect(existsSync(join(moved, 'market', '@scope', 'x.json'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('只补可发布印章：已有索引文件时不提交、不推送', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const worktree = join(root, 'market-index', marketSourceKey(gitSource()), 'worktree');
    mkdirSync(join(worktree, '.git'), { recursive: true });
    mkdirSync(join(worktree, 'market'), { recursive: true });
    writeFileSync(join(worktree, 'market', 'README.md'), 'index\n');
    const fake = fakeGit((args) => {
      if (args[0] === 'status') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--verify') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { exitCode: 0, stdout: 'main\n' };
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${COMMIT}\n` };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    const result = await init({ id: 'team', stampOnly: true });
    expect(result.source.policy).toBe('artifacts-in-repo');
    expect(result.source.ref).toBe('main');
    expect(result.created).toEqual([]);
    expect(result.changed).toBe(false);
    expect(fake.calls.some((one) => one.args[0] === 'commit' || one.args[0] === 'push')).toBe(false);
    expect(store.read().sources[0]?.policy).toBe('artifacts-in-repo');
    rmSync(root, { recursive: true, force: true });
  });

  it('★ 给没在用的源盖章：当前选中的源不跟着变', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    const other: MarketSourceConfig = {
      id: 'other',
      label: '另一个',
      kind: 'git',
      url: 'https://git.example.com/team/other.git',
    };
    await store.apply({ action: 'save', source: gitSource(), select: true });
    await store.apply({ action: 'save', source: other });
    const worktree = join(root, 'market-index', marketSourceKey(other), 'worktree');
    mkdirSync(join(worktree, '.git'), { recursive: true });
    mkdirSync(join(worktree, 'market'), { recursive: true });
    writeFileSync(join(worktree, 'market', 'README.md'), 'index\n');
    const fake = fakeGit((args) => {
      if (args[0] === 'status') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--verify') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { exitCode: 0, stdout: 'main\n' };
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${COMMIT}\n` };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });

    const result = await init({ id: 'other', stampOnly: true });

    expect(result.source.id).toBe('other');
    expect(store.read().selected).toBe('team');
    expect(store.read().sources.find((one) => one.id === 'other')?.policy).toBe('artifacts-in-repo');
    rmSync(root, { recursive: true, force: true });
  });

  it('只补印章时仓库里没有索引文件就拒，不写不推', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const worktree = join(root, 'market-index', marketSourceKey(gitSource()), 'worktree');
    mkdirSync(join(worktree, '.git'), { recursive: true });
    const fake = fakeGit((args) => {
      if (args[0] === 'status') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--verify') return { exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { exitCode: 0, stdout: 'main\n' };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, runGit: fake.runGit });
    await expect(init({ id: 'team', stampOnly: true })).rejects.toThrow(/还没有 market\//);
    expect(fake.calls.some((one) => one.args[0] === 'commit' || one.args[0] === 'push')).toBe(false);
    expect(store.read().sources[0]?.policy).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });
});
