import { describe, expect, it } from 'vitest';
import type { DiscoverEntry, DiscoverSourceRow, DiscoverVersionRow } from '@/kernel/contract/market-index';
import {
  filterEntries,
  publishDateText,
  sortEntries,
  sourceFromUrl,
  sourceFactsOf,
  sourceLabelsOf,
  sourceStateOf,
  unfiltered,
  versionFlagsOf,
  visibleEntries,
} from '../discover-view';

function version(overrides: Partial<DiscoverVersionRow> = {}): DiscoverVersionRow {
  return {
    version: '1.0.0',
    source: { type: 'npm' },
    compat: 'ok',
    install: 'not-installed',
    ...overrides,
  };
}

function entry(overrides: Partial<DiscoverEntry> = {}): DiscoverEntry {
  return {
    name: '@a/module-alpha',
    title: { zh: '阿尔法', en: 'Alpha' },
    description: { zh: '一个模块', en: 'a module' },
    author: 'ada',
    labels: ['workbench'],
    versions: [version()],
    ...overrides,
  };
}

describe('发现页的纯展示逻辑', () => {
  it('搜索命中名称、标题、描述、作者与标签', () => {
    const alpha = entry();
    const beta = entry({ name: '@a/module-beta', title: { zh: '贝塔' }, labels: ['data'] });
    const state = { query: '', category: null, labels: [] };
    expect(filterEntries([alpha, beta], { ...state, query: 'ada' }, 'zh')).toEqual([alpha, beta]);
    expect(filterEntries([alpha, beta], { ...state, query: '贝塔' }, 'zh')).toEqual([beta]);
    expect(filterEntries([alpha, beta], { ...state, query: 'data' }, 'zh')).toEqual([beta]);
    expect(filterEntries([alpha, beta], { ...state, query: 'nope' }, 'zh')).toEqual([]);
  });

  it('分类单选、标签全部命中（多选是 AND）', () => {
    const one = entry({ labels: ['workbench', 'data'] });
    const two = entry({ name: '@a/other', labels: ['workbench'] });
    const base = { query: '', category: null, labels: [] };
    expect(filterEntries([one, two], { ...base, labels: ['workbench', 'data'] }, 'zh')).toEqual([one]);
    expect(filterEntries([one, two], { ...base, category: 'workbench' }, 'zh')).toEqual([]);
    expect(filterEntries([one, two], { ...base, labels: ['workbench'] }, 'zh')).toEqual([one, two]);
  });

  it('排序：默认保序、发布时间取最新版本', () => {
    const alpha = entry({ name: '@a/alpha', title: { zh: '阿尔法' } });
    const beta = entry({
      name: '@a/beta',
      title: { zh: '贝塔' },
      versions: [version({ version: '2.0.0', publishTimestamp: 200 })],
    });
    const older = entry({
      name: '@a/older',
      title: { zh: '更早' },
      versions: [version({ version: '1.0.0', publishTimestamp: 100 })],
    });
    const list = [older, beta, alpha];
    expect(sortEntries(list, 'default')).toEqual(list);
    expect(sortEntries(list, 'published').map((one) => one.name)).toEqual(['@a/beta', '@a/older', '@a/alpha']);
  });

  it('分页只截断，不重排', () => {
    const list = [1, 2, 3, 4].map((n) => entry({ name: `@a/m${String(n)}` }));
    expect(visibleEntries(list, 2)).toEqual(list.slice(0, 2));
    expect(visibleEntries(list, 50)).toEqual(list);
  });

  it('版本标记：推荐 / 预发布 / 已装 / 不兼容 / 未验证', () => {
    const latest = version({ version: '2.0.0-beta.1', compat: 'incompatible', install: 'installed' });
    expect(versionFlagsOf(latest, latest)).toEqual({
      recommended: true,
      prerelease: true,
      installed: true,
      incompatible: true,
      unknown: false,
    });
    const stable = version({ version: '1.0.0', compat: 'unknown' });
    expect(versionFlagsOf(stable, latest)).toEqual({
      recommended: false,
      prerelease: false,
      installed: false,
      incompatible: false,
      unknown: true,
    });
  });

  it('来源事实：npm 给包名与注册表，git 给仓库、完整 commit 与目录', () => {
    expect(sourceFactsOf('@a/b', version())).toEqual([{ kind: 'package', value: '@a/b' }]);
    expect(sourceFactsOf('@a/b', version({ source: { type: 'npm', registry: 'https://r.example/' } }))).toEqual([
      { kind: 'package', value: '@a/b' },
      { kind: 'registry', value: 'https://r.example/' },
    ]);
    expect(
      sourceFactsOf('@a/b', version({ source: { type: 'git', url: 'ssh://git/r.git', commit: 'a'.repeat(40) } })),
    ).toEqual([
      { kind: 'repository', value: 'ssh://git/r.git' },
      { kind: 'commit', value: 'a'.repeat(40) },
    ]);
    expect(
      sourceFactsOf(
        '@a/b',
        version({ source: { type: 'git', url: 'ssh://git/r.git', commit: 'b'.repeat(40), path: 'packages/b' } }),
      ),
    ).toContainEqual({ kind: 'directory', value: 'packages/b' });
  });

  it('发布时间按语言格式化；秒级时间戳；没有就不显示', () => {
    expect(publishDateText(undefined, 'en-US')).toBe('');
    expect(publishDateText(0, 'en-US')).toBe('Jan 1, 1970');
  });

  it('索引源地址：http(s) 与 git；带凭据或片段拒绝', () => {
    expect(sourceFromUrl('https://r.example/market.json')).toEqual({
      ok: true,
      source: { id: '', label: 'r.example', kind: 'http', url: 'https://r.example/market.json' },
    });
    expect(sourceFromUrl('https://r.example/market.git/')).toEqual({
      ok: true,
      source: { id: '', label: 'market', kind: 'git', url: 'https://r.example/market.git' },
    });
    expect(sourceFromUrl('https://git.example/team/group/market-test.git')).toEqual({
      ok: true,
      source: { id: '', label: 'market-test', kind: 'git', url: 'https://git.example/team/group/market-test.git' },
    });
    expect(sourceFromUrl('git@git.example:wb/market.git')).toEqual({
      ok: true,
      source: { id: '', label: 'market', kind: 'git', url: 'git@git.example:wb/market.git' },
    });
    expect(sourceFromUrl('ssh://git@git.example/wb/market.git')).toEqual({
      ok: true,
      source: { id: '', label: 'market', kind: 'git', url: 'ssh://git@git.example/wb/market.git' },
    });
    expect(sourceFromUrl('ssh://user:pass@git.example/wb/market.git')).toEqual({ ok: false });
    expect(sourceFromUrl('https://user:pass@r.example/market.json')).toEqual({ ok: false });
    expect(sourceFromUrl('https://token@r.example/market.json')).toEqual({ ok: false });
    expect(sourceFromUrl('https://r.example/market.json#v2')).toEqual({ ok: false });
    expect(sourceFromUrl('ftp://r.example/market.json')).toEqual({ ok: false });
  });

  it('“未筛选”只认空查询、无分类、无标签', () => {
    expect(unfiltered({ query: '  ', category: null, labels: [] })).toBe(true);
    expect(unfiltered({ query: 'x', category: null, labels: [] })).toBe(false);
    expect(unfiltered({ query: '', category: 'workbench', labels: [] })).toBe(false);
    expect(unfiltered({ query: '', category: null, labels: ['demo'] })).toBe(false);
  });

  it('索引源显示名：同主机不同路径用末段区分，同名仓库用传输区分，唯一名保持原样', () => {
    const sources: readonly DiscoverSourceRow[] = [
      { id: 'a', label: 'r.example', kind: 'http', url: 'https://r.example/market.json', writable: false },
      { id: 'b', label: 'r.example', kind: 'http', url: 'https://r.example/other.json', writable: false },
      { id: 'c', label: 'repo', kind: 'git', url: 'git@git.example:wb/repo.git', writable: null },
      { id: 'd', label: 'mirror', kind: 'git', url: 'git@git.example:wb/mirror.git', writable: null },
      { id: 'e', label: 'mirror', kind: 'git', url: 'https://git.example/wb/mirror.git', writable: null },
    ];
    const labels = sourceLabelsOf(sources);
    expect(labels.get('a')).toBe('market.json · r.example');
    expect(labels.get('b')).toBe('other.json · r.example');
    expect(labels.get('c')).toBe('repo');
    expect(labels.get('d')).toBe('ssh · mirror');
    expect(labels.get('e')).toBe('https · mirror');
  });

  it('索引源状态：只有可发布与只读两种；http、没写过、catalog-only 都是只读', () => {
    const row = (overrides: Partial<DiscoverSourceRow>): DiscoverSourceRow => ({
      id: 's',
      label: 'repo',
      kind: 'git',
      url: 'https://git.example/wb/repo.git',
      writable: null,
      ...overrides,
    });
    expect(sourceStateOf(row({ kind: 'http', url: 'https://r.example/market.json', writable: false }))).toBe(
      'read-only',
    );
    expect(sourceStateOf(row({ policy: 'artifacts-in-repo' }))).toBe('writable');
    expect(sourceStateOf(row({ policy: 'catalog-only' }))).toBe('read-only');
    expect(sourceStateOf(row({}))).toBe('read-only');
  });
});
