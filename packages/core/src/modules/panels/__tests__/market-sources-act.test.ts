import { describe, expect, it, vi } from 'vitest';
import type { MarketSourcesPayload } from '@/kernel/contract/market-index';
import { MARKET_SOURCES_RESOURCE, MARKET_SOURCES_ROUTE } from '@/kernel/contract/market-index';
import { marketSourcesAction, marketSourcesRoutes, parseMarketSourcesAction } from '../model/market-sources-act';

const EMPTY: MarketSourcesPayload = { sources: [], selected: null };

describe('索引源写动作', () => {
  it('认得 save / remove / select 三种载荷，坏形状点名', () => {
    expect(parseMarketSourcesAction({ action: 'remove', id: 'src-1' })).toEqual({ action: 'remove', id: 'src-1' });
    expect(parseMarketSourcesAction({ action: 'select', id: null })).toEqual({ action: 'select', id: null });
    expect(() => parseMarketSourcesAction({ action: 'save', source: { id: 'x' } })).toThrow();
    expect(() => parseMarketSourcesAction({ action: 'nope' })).toThrow();
  });

  it('自己的资源名交给外壳，handle 只转给 store', async () => {
    const apply = vi.fn(async (): Promise<MarketSourcesPayload> => EMPTY);
    const action = marketSourcesAction({ read: () => EMPTY, apply });
    expect(action.resource).toBe(MARKET_SOURCES_RESOURCE);
    await expect(action.handle({ action: 'select', id: null })).resolves.toEqual({ ok: true, ...EMPTY });
    expect(apply).toHaveBeenCalledWith({ action: 'select', id: null });
  });

  it('索引源读口不等索引：直接回 store 里的源与选中项', async () => {
    const source = {
      id: 'team',
      label: '团队',
      kind: 'git' as const,
      url: 'https://git.example.com/wb/market.git',
    };
    const payload: MarketSourcesPayload = { sources: [source], selected: 'team' };
    const routes = marketSourcesRoutes({ read: () => payload, apply: vi.fn() });
    expect(Object.keys(routes)).toEqual([MARKET_SOURCES_ROUTE]);
    await expect(routes[MARKET_SOURCES_ROUTE]?.(new URLSearchParams())).resolves.toEqual({ ok: true, ...payload });
  });

  it('init 交给初始化器，成功后才存配置并回分支 / commit', async () => {
    const source = {
      id: 'team',
      label: '团队',
      kind: 'git' as const,
      url: 'https://git.example.com/wb/market.git',
      ref: 'main',
      policy: 'artifacts-in-repo' as const,
    };
    const apply = vi.fn(async (): Promise<MarketSourcesPayload> => ({ sources: [source], selected: 'team' }));
    const read = (): MarketSourcesPayload => ({ sources: [source], selected: 'team' });
    const init = vi.fn(async () => ({
      source,
      branch: 'main',
      commit: 'c'.repeat(40),
      created: ['market.json'],
      changed: true,
    }));
    const action = marketSourcesAction({ read, apply }, init);
    await expect(action.handle({ action: 'init', id: 'team', ref: 'main', stampOnly: true })).resolves.toEqual({
      ok: true,
      sources: [source],
      selected: 'team',
      branch: 'main',
      commit: 'c'.repeat(40),
      created: ['market.json'],
    });
    expect(init).toHaveBeenCalledWith({ id: 'team', ref: 'main', stampOnly: true });
    expect(apply).not.toHaveBeenCalled();
  });

  it('init 载荷校验 id 与分支名，认得只补印章的写法', () => {
    expect(() => parseMarketSourcesAction({ action: 'init' })).toThrow(/id/);
    expect(() => parseMarketSourcesAction({ action: 'init', id: 'team', ref: 'bad name' })).toThrow(/分支/);
    expect(parseMarketSourcesAction({ action: 'init', id: 'team', ref: '' })).toEqual({ action: 'init', id: 'team' });
    expect(parseMarketSourcesAction({ action: 'init', id: 'team', stampOnly: true })).toEqual({
      action: 'init',
      id: 'team',
      stampOnly: true,
    });
  });
});
