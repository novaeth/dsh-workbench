import { describe, expect, it, vi } from 'vitest';
import type { DiscoverDoc, DiscoverPayload } from '@/kernel/contract/market-index';
import { MARKET_DISCOVER_ROUTE, MARKET_DOC_ROUTE } from '@/kernel/contract/market-index';
import { marketDiscoverRoutes } from '../model/market-discover-routes';

describe('发现页的只读路由', () => {
  it('挂在 panels/market-discover 上，包好读口信封，并把搜索与 force 透给域服务', async () => {
    const snapshot = vi.fn(
      async (): Promise<DiscoverPayload> => ({ state: 'ready', sources: [], selected: null, entries: [] }),
    );
    const document = vi.fn(
      async (): Promise<DiscoverDoc> => ({ ok: true, kind: 'changelog', version: '0.1.0', text: '- 一条' }),
    );
    const routes = marketDiscoverRoutes({ snapshot, document });
    expect(Object.keys(routes)).toEqual([MARKET_DISCOVER_ROUTE, MARKET_DOC_ROUTE]);
    const handler = routes[MARKET_DISCOVER_ROUTE];
    expect(handler).toBeDefined();
    const body = await handler?.(new URLSearchParams('q=probe&category=workbench&force=1'));
    expect(snapshot).toHaveBeenCalledWith({ query: 'probe', category: 'workbench', force: true });
    expect(body).toEqual({ ok: true, state: 'ready', sources: [], selected: null, entries: [] });
  });

  it('文档读口按 name / version / kind 取，kind 只认 changelog 与 readme', async () => {
    const snapshot = vi.fn(async (): Promise<DiscoverPayload> => ({
      state: 'ready',
      sources: [],
      selected: null,
      entries: [],
    }));
    const document = vi.fn(
      async (): Promise<DiscoverDoc> => ({ ok: true, kind: 'changelog', version: '0.1.0', text: '- 一条' }),
    );
    const routes = marketDiscoverRoutes({ snapshot, document });
    const handler = routes[MARKET_DOC_ROUTE];
    const body = await handler?.(new URLSearchParams('name=%40demo%2Fprobe&version=0.1.0&kind=changelog'));
    expect(document).toHaveBeenCalledWith('@demo/probe', '0.1.0', 'changelog');
    expect(body).toEqual({
      ok: true,
      doc: { ok: true, kind: 'changelog', version: '0.1.0', text: '- 一条' },
    });
    await handler?.(new URLSearchParams('name=x&version=1.0.0&kind=bogus'));
    expect(document).toHaveBeenLastCalledWith('x', '1.0.0', 'readme');
  });
});
