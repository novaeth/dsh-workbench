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

describe('已安装页问索引：谁有新版', () => {
  it('索引里有更新的版本才算一条，并把地址换成「你当初装它那种传输」', () => {
    const rows = installedFromIndexes({
      sources: [source('s1')],
      cached: () => indexOf([{ name: '@t/a', version: '1.2.0' }]),
      modules: [moduleOf('@t/a', '1.1.0', 'a')],
      dependencyOf: () => 'git+ssh://git@host/org/repo.git#' + 'a'.repeat(40) + '&path:/packages/@t/a',
      isNewer: newer,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pkg: '@t/a', unit: 'a', version: '1.2.0', sourceId: 's1' });
    expect(rows[0]?.source.type === 'git' ? rows[0].source.url : '').toBe('ssh://git@host/org/repo.git');
  });

  it('一样新 / 更旧 / 没缓存 / 索引里没有，都不冒出来', () => {
    const modules = [moduleOf('@t/a', '1.2.0'), moduleOf('@t/b', '2.0.0'), moduleOf('@t/c', '1.0.0')];
    const rows = installedFromIndexes({
      sources: [source('s1'), source('s2')],
      cached: (one) =>
        one.id === 's1'
          ? indexOf([
              { name: '@t/a', version: '1.2.0' },
              { name: '@t/b', version: '1.9.0' },
            ])
          : undefined,
      modules,
      dependencyOf: () => undefined,
      isNewer: newer,
    });
    expect(rows).toEqual([]);
  });

  it('同一个包在两个索引里都有，只认先找到的那一个', () => {
    const rows = installedFromIndexes({
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

  it('https 装的还走 https：不自作主张塞一条 ssh 地址给 pnpm', () => {
    const rows = installedFromIndexes({
      sources: [source('s1')],
      cached: () => indexOf([{ name: '@t/a', version: '2.0.0', url: 'ssh://git@host/org/repo.git' }]),
      modules: [moduleOf('@t/a', '1.0.0')],
      dependencyOf: () => 'git+https://host/org/repo.git#' + 'a'.repeat(40) + '&path:/packages/@t/a',
      isNewer: newer,
    });
    expect(rows[0]?.source.type === 'git' ? rows[0].source.url : '').toBe('https://host/org/repo.git');
  });
});
