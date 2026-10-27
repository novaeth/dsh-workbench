import { describe, expect, it } from 'vitest';
import type { MarketIndex, MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { ProfileModule } from '@dsh-workbench/shared/host';
import { installedFromIndexes } from './market-installed';

const source = (id: string, url = 'https://host/org/repo.git'): MarketSourceConfig => ({
  id,
  label: id,
  kind: 'git',
  url,
  ref: 'main',
});

function indexOf(entries: readonly { name: string; version: string; url?: string }[]): MarketIndex {
  return {
    format: 1,
    plugins: entries.map((entry) => ({
      name: entry.name,
      versions: [
        {
          version: entry.version,
          source: {
            type: 'git',
            url: entry.url ?? 'https://host/org/repo.git',
            commit: 'a'.repeat(40),
            path: `packages/${entry.name}`,
          },
        },
      ],
    })),
  };
}

function moduleOf(pkg: string, version: string, unit = pkg): ProfileModule {
  return { pkg, unit, version };
}

const newer = (latest: string, installed: string): boolean =>
  latest.localeCompare(installed, undefined, { numeric: true }) > 0;

const SPEC_HTTPS = 'git+https://host/org/repo.git#' + 'a'.repeat(40) + '&path:/packages/@t/a';
const SPEC_SSH = 'git+ssh://git@host/org/repo.git#' + 'a'.repeat(40) + '&path:/packages/@t/a';

function probeOf(table: Readonly<Record<string, 'ok' | 'auth' | 'unreachable'>>): {
  readonly probe: (url: string) => Promise<'ok' | 'auth' | 'unreachable'>;
  readonly calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    probe: (url) => {
      calls.push(url);
      return Promise.resolve(table[url] ?? 'unreachable');
    },
  };
}

const gitUrlOf = (row: { readonly source: { readonly type: string; readonly url?: string } } | undefined): string =>
  row !== undefined && row.source.type === 'git' ? (row.source.url ?? '') : '';

describe('已安装页问索引：谁有新版', () => {
  it('★ 索引里有更高的版本才算一条；传输按「当初装它那种」先试，通了就不再多探', async () => {
    const fake = probeOf({ 'ssh://git@host/org/repo.git': 'ok' });
    const rows = await installedFromIndexes({
      sources: [source('s1')],
      cached: () => indexOf([{ name: '@t/a', version: '1.2.0' }]),
      modules: [moduleOf('@t/a', '1.1.0', 'a')],
      dependencyOf: () => SPEC_SSH,
      isNewer: newer,
      probe: fake.probe,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pkg: '@t/a', unit: 'a', version: '1.2.0', sourceId: 's1' });
    expect(gitUrlOf(rows[0])).toBe('ssh://git@host/org/repo.git');
    expect(fake.calls).toEqual(['ssh://git@host/org/repo.git']);
  });

  it('★ 上次成功的那种优先：哪怕当初是用另一种装的', async () => {
    const fake = probeOf({
      'https://host/org/repo.git': 'ok',
      'ssh://git@host/org/repo.git': 'ok',
    });
    const rows = await installedFromIndexes({
      sources: [source('s1')],
      cached: () => indexOf([{ name: '@t/a', version: '1.2.0' }]),
      modules: [moduleOf('@t/a', '1.0.0')],
      dependencyOf: () => SPEC_SSH,
      isNewer: newer,
      probe: fake.probe,
      preferred: (host) => (host === 'host' ? 'https' : undefined),
    });
    expect(gitUrlOf(rows[0])).toBe('https://host/org/repo.git');
    expect(fake.calls).toEqual(['https://host/org/repo.git']);
  });

  it('★ 装它那种现在不通了（凭证没了）→ 换另一种试，别把死地址塞给 pnpm', async () => {
    const fake = probeOf({
      'https://host/org/repo.git': 'auth',
      'ssh://git@host/org/repo.git': 'ok',
    });
    const rows = await installedFromIndexes({
      sources: [source('s1')],
      cached: () => indexOf([{ name: '@t/a', version: '1.2.0' }]),
      modules: [moduleOf('@t/a', '1.0.0')],
      dependencyOf: () => SPEC_HTTPS,
      isNewer: newer,
      probe: fake.probe,
    });
    expect(gitUrlOf(rows[0])).toBe('ssh://git@host/org/repo.git');
    expect(fake.calls[0]).toBe('https://host/org/repo.git');
  });

  it('两种都读不到就退回原来那种（让更新自己去报那句话）', async () => {
    const fake = probeOf({
      'https://host/org/repo.git': 'auth',
      'ssh://git@host/org/repo.git': 'unreachable',
    });
    const rows = await installedFromIndexes({
      sources: [source('s1')],
      cached: () => indexOf([{ name: '@t/a', version: '1.2.0' }]),
      modules: [moduleOf('@t/a', '1.0.0')],
      dependencyOf: () => SPEC_HTTPS,
      isNewer: newer,
      probe: fake.probe,
    });
    expect(gitUrlOf(rows[0])).toBe('https://host/org/repo.git');
  });

  it('没有探测能力时不动地址（发布者怎么写就用什么）', async () => {
    const rows = await installedFromIndexes({
      sources: [source('s1')],
      cached: () => indexOf([{ name: '@t/a', version: '1.2.0', url: 'ssh://git@host/org/repo.git' }]),
      modules: [moduleOf('@t/a', '1.0.0')],
      dependencyOf: () => SPEC_HTTPS,
      isNewer: newer,
    });
    expect(gitUrlOf(rows[0])).toBe('ssh://git@host/org/repo.git');
  });

  it('一样新 / 更旧 / 没缓存 / 索引里没有，都不冒出来', async () => {
    const rows = await installedFromIndexes({
      sources: [source('s1'), source('s2')],
      cached: (one) =>
        one.id === 's1'
          ? indexOf([
              { name: '@t/a', version: '1.2.0' },
              { name: '@t/b', version: '1.9.0' },
            ])
          : undefined,
      modules: [moduleOf('@t/a', '1.2.0'), moduleOf('@t/b', '2.0.0'), moduleOf('@t/c', '1.0.0')],
      dependencyOf: () => undefined,
      isNewer: newer,
    });
    expect(rows).toEqual([]);
  });

  it('同一个包在两个索引里都有，只认先找到的那一个', async () => {
    const rows = await installedFromIndexes({
      sources: [source('s1'), source('s2')],
      cached: (one) => indexOf([{ name: '@t/a', version: one.id === 's1' ? '2.0.0' : '3.0.0' }]),
      modules: [moduleOf('@t/a', '1.0.0')],
      dependencyOf: () => undefined,
      isNewer: newer,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe('2.0.0');
    expect(rows[0]?.sourceId).toBe('s1');
  });
});
