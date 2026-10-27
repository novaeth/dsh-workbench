import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import type { MarketIndex, MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { MarketIndexReader } from '@/shared/api/host/market-index-fetch';
import type { MarketDocReader } from '@/shared/api/host/market-doc';
import type { MarketSourcesStore } from '@/shared/api/host/market-sources-store';
import { createMarketDiscover, installTargetOf } from '../model/market-discover';

const SOURCE: MarketSourceConfig = {
  id: 'team',
  label: '团队',
  kind: 'git',
  url: 'https://git.company.com/wb/market.git',
  ref: 'main',
};

function indexOf(plugins: MarketIndex['plugins']): MarketIndex {
  return { format: 1, plugins };
}

function entry(name: string, version: string, labels: readonly string[] = ['workbench']) {
  return {
    name,
    title: { zh: name },
    metadata: { category: 'workbench', labels },
    versions: [
      {
        version,
        source: {
          type: 'git' as const,
          url: 'https://git.company.com/wb/market.git',
          commit: 'a'.repeat(40),
          path: `packages/${name.split('/')[1]}`,
        },
      },
    ],
  };
}

function setup(options: {
  readonly index: MarketIndex;
  readonly installed?: readonly { pkg: string; unit: string; version: string }[];
  readonly sources?: readonly MarketSourceConfig[];
  readonly selected?: string | null;
  readonly fetchImpl?: ((url: string, init: RequestInit) => Promise<Response>) | undefined;
  readonly shell?: DshShell | undefined;
  readonly repoDir?: string | undefined;
}) {
  const sources = options.sources ?? [SOURCE];
  const selected = options.selected === undefined ? (sources[0]?.id ?? null) : options.selected;
  const store: MarketSourcesStore = {
    read: () => ({ sources, selected }),
    apply: async () => ({ sources, selected }),
    rememberTransport: async () => undefined,
  };
  const reader: MarketIndexReader = {
    read: async () => ({ ok: true, index: options.index, fetchedAt: 1000 }),
    cached: () => undefined,
    pathOf: () => options.repoDir ?? '/tmp/none',
  };
  const docs: MarketDocReader = {
    read: async (_source, target, kind) => ({ ok: true, kind, version: target.version, text: `# ${kind}` }),
  };
  return createMarketDiscover({
    store,
    reader,
    docs,
    modules: () => options.installed ?? [],
    defaultRegistry: async () => 'https://npm.company.com/',
    shellVersion: '0.3.11',
    ...(options.shell === undefined ? {} : { shell: options.shell }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    now: () => 1000,
  });
}

describe('发现域', () => {
  it('只列带 workbench 标签的条目', async () => {
    const discover = setup({
      index: indexOf([entry('@a/x', '0.1.0'), entry('@a/y', '0.1.0', ['other'])]),
    });
    const payload = await discover.snapshot();
    expect(payload.state).toBe('ready');
    expect(payload.entries.map((one) => one.name)).toEqual(['@a/x']);
  });

  it('★ 新条目靠 metadata.workbench 认身份，labels 只是展示、可以没有', async () => {
    const plain = { ...entry('@a/plain', '0.1.0'), metadata: { workbench: true } };
    const discover = setup({ index: indexOf([plain, entry('@a/y', '0.1.0', ['other'])]) });
    const payload = await discover.snapshot();

    expect(payload.entries.map((one) => one.name)).toEqual(['@a/plain']);
    expect(payload.entries[0]?.labels).toEqual([]);
  });

  it('已装旧版是 update-available，同版是 installed', async () => {
    const discover = setup({
      index: indexOf([
        {
          ...entry('@a/x', '0.1.1'),
          versions: [
            { version: '0.1.1', source: { type: 'git', url: SOURCE.url, commit: 'a'.repeat(40), path: 'packages/x' } },
            { version: '0.1.0', source: { type: 'git', url: SOURCE.url, commit: 'b'.repeat(40), path: 'packages/x' } },
          ],
        },
      ]),
      installed: [{ pkg: '@a/x', unit: 'x', version: '0.1.0' }],
    });
    const payload = await discover.snapshot();
    const row = payload.entries[0];
    expect(row?.installedVersion).toBe('0.1.0');
    expect(row?.versions.map((one) => one.install)).toEqual(['update-available', 'installed']);
  });

  it('npm 条目的外壳 peer 不满足标 incompatible', async () => {
    const discover = setup({
      index: indexOf([
        {
          name: '@a/npm',
          metadata: { labels: ['workbench'] },
          versions: [{ version: '0.1.0', source: { type: 'npm' } }],
        },
      ]),
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            versions: { '0.1.0': { peerDependencies: { '@dsh-workbench/core': '^0.1.0' } } },
          }),
        }) as unknown as Response,
    });
    const payload = await discover.snapshot();
    expect(payload.entries[0]?.versions[0]?.compat).toBe('incompatible');
  });

  it('没有索引源时是 no-source', async () => {
    const discover = setup({ index: indexOf([]), sources: [], selected: null });
    expect((await discover.snapshot()).state).toBe('no-source');
  });

  it('安装目标从条目 source 拼', async () => {
    const discover = setup({ index: indexOf([entry('@a/x', '0.1.1')]) });
    const payload = await discover.snapshot();
    const target = installTargetOf(payload.entries[0]!, '0.1.1');
    expect(target?.spec).toBe(`git+https://git.company.com/wb/market.git#${'a'.repeat(40)}&path:/packages/x`);
  });
});

describe('git 条的 peer 从缓存仓库读', () => {
  it('同一仓库的 commit 里读出 peer', async () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'wb-discover-repo-'));
    mkdirSync(join(repoDir, 'repo.git'), { recursive: true });
    const shell = {
      resolve(request: { command: string }) {
        return { command: request.command };
      },
      async execute(spec: { command: string }) {
        const stdout = spec.command.includes('package.json')
          ? JSON.stringify({ peerDependencies: { '@dsh-workbench/core': '^0.3.0' } })
          : '';
        return {
          async result() {
            return {
              exitCode: 0,
              timedOut: false,
              aborted: false,
              stdout: { text: stdout, truncated: false },
              stderr: { text: '', truncated: false },
            };
          },
        };
      },
    } as unknown as DshShell;
    const discover = setup({ index: indexOf([entry('@a/x', '0.1.0')]), shell, repoDir });
    const payload = await discover.snapshot();
    expect(payload.entries[0]?.versions[0]?.compat).toBe('ok');
    rmSync(repoDir, { recursive: true, force: true });
  });
});

describe('模块文档', () => {
  it('按条目与版本把说明 / 更新日志交给读源', async () => {
    const discover = setup({ index: indexOf([entry('@a/x', '0.1.0')]) });
    expect(await discover.document('@a/x', '0.1.0', 'changelog')).toEqual({
      ok: true,
      kind: 'changelog',
      version: '0.1.0',
      text: '# changelog',
    });
    expect(await discover.document('@a/x', '0.1.0', 'readme')).toEqual({
      ok: true,
      kind: 'readme',
      version: '0.1.0',
      text: '# readme',
    });
  });

  it('条目或版本不在索引里 → missing', async () => {
    const discover = setup({ index: indexOf([entry('@a/x', '0.1.0')]) });
    expect(await discover.document('@a/y', '0.1.0', 'readme')).toEqual({
      ok: false,
      kind: 'readme',
      version: '0.1.0',
      reason: 'missing',
    });
    expect(await discover.document('@a/x', '9.9.9', 'readme')).toEqual({
      ok: false,
      kind: 'readme',
      version: '9.9.9',
      reason: 'missing',
    });
  });

  it('没有选中的索引源 → unavailable', async () => {
    const discover = setup({ index: indexOf([]), sources: [], selected: null });
    const doc = await discover.document('@a/x', '0.1.0', 'readme');
    expect(doc.ok).toBe(false);
    if (doc.ok) return;
    expect(doc.reason).toBe('unavailable');
  });
});
