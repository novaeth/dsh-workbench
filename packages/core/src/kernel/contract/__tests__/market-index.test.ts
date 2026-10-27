import { describe, expect, it } from 'vitest';
import {
  MARKET_DISCOVER_ROUTE,
  MARKET_INDEX_FORMAT,
  MARKET_INDEX_PATH,
  MARKET_SOURCES_RESOURCE,
  MARKET_SOURCES_ROUTE,
  MARKET_WORKBENCH_LABEL,
} from '../market-index';

describe('市场索引契约的转发入口', () => {
  it('常量与 format 1 / 发现路由一致', () => {
    expect(MARKET_INDEX_FORMAT).toBe(1);
    expect(MARKET_INDEX_PATH).toBe('market.json');
    expect(MARKET_DISCOVER_ROUTE).toBe('panels/market-discover');
    expect(MARKET_SOURCES_RESOURCE).toBe('market-sources');
    expect(MARKET_SOURCES_ROUTE).toBe('panels/market-sources');
    expect(MARKET_WORKBENCH_LABEL).toBe('workbench');
  });
});
