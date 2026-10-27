import { describe, expect, it } from 'vitest';
import type { ModuleVersion } from '@/kernel/contract/bundle-install';
import type { MarketInstalledModule } from '@/kernel/contract/market-index';
import type { MarketRow } from '../../rightbar/market-rows';
import { marketActions } from '../../rightbar/market-rows';
import { withMarketUpdates } from '../use-module-versions';

const market: MarketInstalledModule = {
  pkg: '@t/a',
  unit: 'a',
  version: '1.2.0',
  sourceId: 's1',
  sourceLabel: 'index',
  source: { type: 'git', url: 'https://host/org/repo.git', commit: 'a'.repeat(40), path: 'packages/@t/a' },
};

const moduleOf = (over: Partial<ModuleVersion> = {}): ModuleVersion => ({
  unit: 'a',
  pkg: '@t/a',
  installed: '1.1.0',
  ...over,
});

const rowOf = (over: Partial<MarketRow> = {}): MarketRow => ({
  id: 'a',
  titleKey: 'dsh-workbench.unit.a.title',
  state: 'outdated',
  canInstall: false,
  canUpdate: true,
  canUninstall: true,
  pkg: '@t/a',
  ...over,
});

describe('已安装页：索引里那条新版，走的是索引自己的更新路', () => {
  it('★ 索引说有新版 → 补上 latest 并记住它是从哪来的', () => {
    const merged = withMarketUpdates([moduleOf()], [market]);
    expect(merged[0]?.latest).toBe('1.2.0');
    expect(merged[0]?.market?.sourceId).toBe('s1');
  });

  it('★ 索引里没有它 → 一个字不动（npm 那条路照旧）', () => {
    const original = moduleOf({ latest: '1.3.0' });
    expect(withMarketUpdates([original], [])).toEqual([original]);
  });

  it('★ 有索引来源的行，更新按钮发 install-version（spec 按索引拼），不是 update-bundle', () => {
    const actions = marketActions(
      rowOf({ market, moduleUpdate: { installed: '1.1.0', latest: '1.2.0', market } }),
    );
    expect(actions).toContain('install-version');
    expect(actions).not.toContain('update-bundle');
  });

  it('没有索引来源的行还是 update-bundle', () => {
    const actions = marketActions(rowOf({ moduleUpdate: { installed: '1.1.0', latest: '1.2.0' } }));
    expect(actions).toContain('update-bundle');
    expect(actions).not.toContain('install-version');
  });

  it('★ 有来源但拼不出 spec（没有包名）时退回 update-bundle，不留一个点了就报错的按钮', () => {
    const actions = marketActions(
      rowOf({ pkg: undefined, market, moduleUpdate: { installed: '1.1.0', latest: '1.2.0', market } }),
    );
    expect(actions).toContain('update-bundle');
    expect(actions).not.toContain('install-version');
  });
});
