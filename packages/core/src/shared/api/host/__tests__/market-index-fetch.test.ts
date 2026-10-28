import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
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

function fakeShell(reply: (command: string) => { exitCode: number; stdout?: string; stderr?: string }) {
  const calls: string[] = [];
  const shell = {
    resolve(request: { command: string }) {
      calls.push(request.command);
      return { command: request.command };
    },
    async execute(spec: { command: string }) {
      const outcome = reply(spec.command);
      return {
        async result() {
          return {
            exitCode: outcome.exitCode,
            timedOut: false,
            aborted: false,
            stdout: { text: outcome.stdout ?? '', truncated: false },
            stderr: { text: outcome.stderr ?? '', truncated: false },
          };
        },
      };
    },
  } as unknown as DshShell;
  return { shell, calls };
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
    const fake = fakeShell((command) => {
      if (command.includes('git clone')) return { exitCode: 0 };
      if (command.includes('ls-tree')) {
        return {
          exitCode: 0,
          stdout: `100644 blob ${'c'.repeat(40)}\tmarket/@scope/module-x.json\n100644 blob ${'d'.repeat(40)}\tmarket/README.md\n`,
        };
      }
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: `${commit}\n` };
      if (command.includes(' fetch ')) return { exitCode: 0 };
      return { exitCode: 0, stdout: JSON.stringify(doc) };
    });
    const reader = createMarketIndexReader({ root, shell: fake.shell, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.commit).toBe(commit);
    expect(outcome.index.plugins[0]?.name).toBe('@scope/module-x');
    expect(outcome.index.plugins[0]?.versions).toEqual([
      { version: '0.1.0', source: { type: 'npm' }, publishTimestamp: 1_760_000_000 },
    ]);
    expect(fake.calls[0]).toContain("git clone --bare --depth 1 --branch 'main'");
    expect(fake.calls.every((line) => line.includes('GIT_TERMINAL_PROMPT=0'))).toBe(true);
    expect(fake.calls.every((line) => line.includes('GIT_ASKPASS='))).toBe(true);
    expect(fake.calls.every((line) => line.includes('SSH_ASKPASS_REQUIRE=never'))).toBe(true);
    expect(fake.calls.some((line) => line.includes('ls-tree') && line.includes(commit))).toBe(true);
    expect(
      fake.calls.some((line) => line.includes('show') && line.includes('market/@scope/module-x.json')),
    ).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('老仓库只有 market.json（没有条目目录）时按单文件读，不报缺索引', async () => {
    const root = tempRoot();
    const commit = 'e'.repeat(40);
    const fake = fakeShell((command) => {
      if (command.includes('git clone')) return { exitCode: 0 };
      if (command.includes('ls-tree')) return { exitCode: 0, stdout: '' };
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: `${commit}\n` };
      if (command.includes('show')) return { exitCode: 0, stdout: JSON.stringify(INDEX) };
      return { exitCode: 0 };
    });
    const reader = createMarketIndexReader({ root, shell: fake.shell, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.index.plugins[0]?.name).toBe('@scope/module-x');
    expect(fake.calls.some((line) => line.includes('show') && line.includes('market.json'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('空仓库报 git-empty，并带上仓库默认分支', async () => {
    const root = tempRoot();
    const fake = fakeShell((command) => {
      if (command.includes('git clone')) return { exitCode: 0 };
      if (command.includes('symbolic-ref')) return { exitCode: 0, stdout: 'trunk\n' };
      if (command.includes('rev-parse')) return { exitCode: 128, stderr: 'fatal: Needed a single revision' };
      return { exitCode: 0 };
    });
    const reader = createMarketIndexReader({ root, shell: fake.shell, now: () => 1000 });
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
    const fake = fakeShell((command) => {
      if (command.includes('git clone')) return { exitCode: 0 };
      if (command.includes('symbolic-ref')) return { exitCode: 0, stdout: 'main\n' };
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: `${commit}\n` };
      if (command.includes('ls-tree')) return { exitCode: 0, stdout: '' };
      if (command.includes('show')) {
        return { exitCode: 1, stderr: "fatal: path 'market.json' does not exist in 'HEAD'" };
      }
      return { exitCode: 0 };
    });
    const reader = createMarketIndexReader({ root, shell: fake.shell, now: () => 1000 });
    const outcome = await reader.read(gitSource());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.kind).toBe('git-missing-index');
    expect(outcome.problem.branch).toBe('main');
    rmSync(root, { recursive: true, force: true });
  });

  it('没有 git 执行缝时单独报 git-missing', async () => {
    const root = tempRoot();
    const reader = createMarketIndexReader({ root });
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
