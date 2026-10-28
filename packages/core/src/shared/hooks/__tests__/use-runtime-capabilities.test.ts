import { describe, expect, it } from 'vitest';
import { pluginMarketOf } from '../use-runtime-capabilities';

describe('能力缺省时插件市场入口怎么判', () => {
  it('未知（还没读到 health）照旧显示，不闪', () => {
    expect(pluginMarketOf(undefined)).toBe(true);
  });

  it('适配器明确说没有插件市场就收起', () => {
    expect(
      pluginMarketOf({
        console: false,
        pluginMarket: false,
        browserBridge: true,
        libs: false,
      }),
    ).toBe(false);
  });

  it('有插件市场就显示', () => {
    expect(
      pluginMarketOf({
        console: true,
        pluginMarket: true,
        browserBridge: true,
        libs: true,
      }),
    ).toBe(true);
  });
});
