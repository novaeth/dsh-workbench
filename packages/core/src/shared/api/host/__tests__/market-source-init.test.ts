import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import { marketSourceKey } from '@dsh-workbench/shared/host';
import { createMarketSourceInitializer } from '../market-source-init';
import { createMarketSourcesStore } from '../market-sources-store';

const COMMIT = 'c'.repeat(40);

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'wb-market-init-'));
}

function gitSource(): MarketSourceConfig {
  return { id: 'team', label: '市场', kind: 'git', url: 'https://git.example.com/team/market.git' };
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

describe('createMarketSourceInitializer', () => {
  it('空仓库按仓库默认分支建索引、写 market.json + README、推首个 commit', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const fake = fakeShell((command) => {
      if (command.includes('git clone')) return { exitCode: 0 };
      if (command.includes('--verify')) return { exitCode: 128, stderr: 'fatal: Needed a single revision' };
      if (command.includes('symbolic-ref')) return { exitCode: 0, stdout: 'trunk\n' };
      if (command.includes('status')) return { exitCode: 0 };
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: `${COMMIT}\n` };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, shell: fake.shell });
    const result = await init({ id: 'team' });
    expect(result.branch).toBe('trunk');
    expect(result.commit).toBe(COMMIT);
    expect(result.changed).toBe(true);
    expect(result.created).toEqual(['market.json', 'README.md']);
    expect(result.source.ref).toBe('trunk');
    expect(result.source.policy).toBe('artifacts-in-repo');
    expect(store.read().sources[0]?.ref).toBe('trunk');
    const worktree = join(root, 'market-index', marketSourceKey(result.source), 'worktree');
    expect(existsSync(join(worktree, 'market.json'))).toBe(true);
    expect(existsSync(join(worktree, 'README.md'))).toBe(true);
    expect(fake.calls.filter((line) => line.includes('push')).length).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('已有提交的仓库切到指定分支；初始化后清掉读取缓存', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const oldKey = marketSourceKey(gitSource());
    mkdirSync(join(root, 'market-index', oldKey, 'repo.git'), { recursive: true });
    writeFileSync(join(root, 'market-index', oldKey, 'index.json'), '{"format":1,"plugins":[]}');
    const fake = fakeShell((command) => {
      if (command.includes('git clone')) return { exitCode: 0 };
      if (command.includes('--verify')) return { exitCode: 0 };
      if (command.includes('--abbrev-ref')) return { exitCode: 0, stdout: 'master\n' };
      if (command.includes('status')) return { exitCode: 0 };
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: `${COMMIT}\n` };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, shell: fake.shell });
    const result = await init({ id: 'team', ref: 'main' });
    expect(result.branch).toBe('main');
    expect(fake.calls.some((line) => line.includes('checkout') && line.includes('main'))).toBe(true);
    expect(existsSync(join(root, 'market-index', oldKey))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('本地副本不干净时不写任何东西', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const fake = fakeShell((command) => {
      if (command.includes('git clone')) return { exitCode: 0 };
      if (command.includes('status')) return { exitCode: 0, stdout: ' M market.json\n' };
      return { exitCode: 0 };
    });
    const init = createMarketSourceInitializer({ root, store, shell: fake.shell });
    await expect(init({ id: 'team' })).rejects.toThrow(/未提交改动/);
    rmSync(root, { recursive: true, force: true });
  });

  it('分支名不合格直接拒，不碰仓库', async () => {
    const root = tempRoot();
    const store = createMarketSourcesStore({ root });
    await store.apply({ action: 'save', source: gitSource() });
    const fake = fakeShell(() => ({ exitCode: 0 }));
    const init = createMarketSourceInitializer({ root, store, shell: fake.shell });
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
    const fake = fakeShell(() => ({ exitCode: 0 }));
    const init = createMarketSourceInitializer({ root, store, shell: fake.shell });
    await expect(init({ id: 'web' })).rejects.toThrow(/git/);
    rmSync(root, { recursive: true, force: true });
  });
});
