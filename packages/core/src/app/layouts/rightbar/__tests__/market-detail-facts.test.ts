import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { MarketRow } from '../market-row-types';
import { installSourceOf, isDirectSourceSpec, marketDetailFacts } from '../market-detail-facts';

const t = ((key: string) => key) as Translate;

function rowOf(over: Partial<MarketRow> = {}): MarketRow {
  return {
    id: 'hello',
    titleKey: 'hello.title',
    state: 'installed',
    canInstall: false,
    canUpdate: false,
    canUninstall: true,
    ...over,
  };
}

function factsOf(row: MarketRow): Readonly<Record<string, string>> {
  return Object.fromEntries(marketDetailFacts(row, t).map((fact) => [fact.labelKey, fact.value]));
}

describe('安装源那一格：认得出写死的来源，也认得出注册表', () => {
  it('★ 带协议前缀的 spec 就是安装源本身（Git / 本地目录 / 压缩包）', () => {
    for (const spec of [
      'github:acme/mod#abc123',
      'git+ssh://git@example.com/acme/mod.git',
      'https://example.com/acme/mod.tgz',
      'file:../mod',
      'link:/Users/me/diy/packages/mod',
      '/Users/me/diy/packages/mod',
    ]) {
      expect(isDirectSourceSpec(spec), spec).toBe(true);
    }
    expect(isDirectSourceSpec('^0.1.2')).toBe(false);
    expect(isDirectSourceSpec('latest')).toBe(false);
  });

  it('★ 注册表来源的版本范围：安装源说注册表，依赖声明另起一行', () => {
    const row = rowOf({
      pkg: '@a/hello',
      spec: '^0.1.2',
      registry: 'https://r.example/team/',
      version: { installed: '0.1.2', latest: '0.2.0' },
    });
    const facts = factsOf(row);

    expect(facts['panels.market.detailSource']).toBe('https://r.example/team/');
    expect(facts['panels.market.detailSpec']).toBe('^0.1.2');
    expect(facts['panels.market.detailUnit']).toBe('hello');
    expect(facts['panels.market.detailVersion']).toBe('0.1.2');
    expect(facts['panels.market.detailLatest']).toBe('0.2.0');
  });

  it('★ 写死的 spec 优先当安装源；注册表不再重复一遍', () => {
    const source = installSourceOf(
      rowOf({ pkg: '@a/hello', spec: 'github:acme/mod#abc123', registry: 'https://r.example/' }),
      t,
    );

    expect(source).toEqual({ text: 'github:acme/mod#abc123', code: true });
    const facts = factsOf(
      rowOf({ pkg: '@a/hello', spec: 'github:acme/mod#abc123', registry: 'https://r.example/' }),
    );
    expect(facts['panels.market.detailRegistry']).toBe('https://r.example/');
    expect(facts['panels.market.detailSpec']).toBeUndefined();
  });

  it('两样都没有 → 说没记录，不编一个来源', () => {
    expect(installSourceOf(rowOf(), t)).toEqual({
      text: 'panels.market.detailUnknown',
      code: false,
    });
  });
});

describe('详情页的「来源信息」：模块 / 插件 / 索引给的新版各说各的', () => {
  it('★ 本地装的插件：安装源直接就是那个目录', () => {
    const facts = factsOf(
      rowOf({
        id: 'plugin:/Users/me/my-plugin',
        pkg: '/Users/me/my-plugin',
        label: 'mine',
        plugin: true,
        local: true,
        installedAt: '2026-09-30T08:00:00.000Z',
      }),
    );

    expect(facts['panels.market.detailSource']).toBe('/Users/me/my-plugin');
    expect(facts['panels.market.detailPluginName']).toBe('mine');
    expect(facts['panels.market.detailInstalledAt']).toBe('2026-09-30');
  });

  it('★ 本地装的模块：link: / file: 前缀去掉，直接给真实目录', () => {
    const facts = factsOf(
      rowOf({
        pkg: '@a/hello',
        local: true,
        spec: 'link:/Users/me/diy/packages/hello',
      }),
    );

    expect(facts['panels.market.detailSource']).toBe('/Users/me/diy/packages/hello');
    expect(facts['panels.market.detailSpec']).toBe('link:/Users/me/diy/packages/hello');
  });

  it('★ 本地装但拿不到目录：才退回「本机目录」', () => {
    const facts = factsOf(rowOf({ pkg: '@a/hello', local: true }));
    expect(facts['panels.market.detailSource']).toBe('panels.market.detailLocalDirectory');
  });

  it('★ 插件用注册表装的那一份：安装源就是那个源', () => {
    const facts = factsOf(
      rowOf({
        id: 'plugin:opencli-plugin-inventory',
        pkg: 'opencli-plugin-inventory',
        label: 'inventory',
        plugin: true,
        registry: 'https://r.example/team/',
        installedAt: '2026-09-30T08:00:00.000Z',
      }),
    );

    expect(facts['panels.market.detailSource']).toBe('https://r.example/team/');
    expect(facts['panels.market.detailRegistry']).toBeUndefined();
  });

  it('★ 索引给的新版：索引源 + 新版来源；npm 版本和「可用版本」一样时不另起一行', () => {
    const facts = factsOf(
      rowOf({
        pkg: '@a/hello',
        version: { installed: '0.1.2', latest: '0.2.0' },
        market: {
          pkg: '@a/hello',
          unit: 'hello',
          version: '0.2.0',
          sourceId: 'team',
          sourceLabel: '团队索引',
          source: { type: 'npm', registry: 'https://m.example/' },
        },
      }),
    );

    expect(facts['panels.market.detailMarket']).toBe('团队索引');
    expect(facts['panels.market.detailUpdateSource']).toBe('@a/hello@0.2.0');
    expect(facts['panels.market.detailUpdateVersion']).toBeUndefined();
  });

  it('★ 索引走 Git：仓库、提交、目录都摆出来，新版来源带上 path', () => {
    const row = rowOf({
      pkg: '@a/hello',
      version: { installed: '0.1.2', latest: '0.3.0' },
      market: {
        pkg: '@a/hello',
        unit: 'hello',
        version: '0.2.0',
        sourceId: 'team',
        sourceLabel: '团队索引',
        source: {
          type: 'git',
          url: 'https://git.example/acme/mod.git',
          commit: 'abcdef123456',
          path: 'packages/mod',
        },
      },
    });
    const facts = factsOf(row);

    expect(facts['panels.market.detailRepository']).toBe('https://git.example/acme/mod.git');
    expect(facts['panels.market.detailCommit']).toBe('abcdef123456');
    expect(facts['panels.market.detailDirectory']).toBe('packages/mod');
    expect(facts['panels.market.detailUpdateSource']).toBe(
      'git+https://git.example/acme/mod.git#abcdef123456&path:/packages/mod',
    );
    expect(facts['panels.market.detailUpdateVersion']).toBe('0.2.0');
  });
});
