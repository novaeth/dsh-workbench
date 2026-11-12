import { describe, expect, it, vi } from 'vitest';
import { MARKET_INSTALLED_INFO_ROUTE } from '@/kernel/contract/market-index';
import { installedPackageRoutes } from '../model/installed-package-routes';

describe('已安装包信息路由', () => {
  it('挂在 panels/market-installed-info 上，按包名取元数据', async () => {
    const info = vi.fn(() => ({ pkg: '@a/hello', version: '1.2.3', keywords: [] }));
    const routes = installedPackageRoutes(info);
    expect(Object.keys(routes)).toEqual([MARKET_INSTALLED_INFO_ROUTE]);
    const body = await routes[MARKET_INSTALLED_INFO_ROUTE]?.(new URLSearchParams('pkg=%40a%2Fhello'));
    expect(info).toHaveBeenCalledWith('@a/hello');
    expect(body).toEqual({ ok: true, info: { pkg: '@a/hello', version: '1.2.3', keywords: [] } });
  });

  it('没有这个包时返回 null，不抛错', async () => {
    const routes = installedPackageRoutes(() => null);
    const body = await routes[MARKET_INSTALLED_INFO_ROUTE]?.(new URLSearchParams('pkg=missing'));
    expect(body).toEqual({ ok: true, info: null });
  });
});
