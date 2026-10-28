import { describe, expect, it } from 'vitest';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { browserBridgeOn } from './diy-tools';

function ctxWith(capabilities: unknown): never {
  return {
    get: (key: string) =>
      key === WORKBENCH_ADAPTERS
        ? { runtime: { capabilities: () => capabilities } }
        : undefined,
  } as never;
}

describe('浏览器桥能力决定 DIY 浏览器工具在不在', () => {
  it('适配器声明有桥 → 注册', () => {
    expect(browserBridgeOn(ctxWith({ browserBridge: true }))).toBe(true);
  });

  it('适配器声明没有桥 → 整族工具不出现', () => {
    expect(browserBridgeOn(ctxWith({ browserBridge: false }))).toBe(false);
  });

  it('没有适配器集合（纯单元测试 / 降级）→ 照旧注册', () => {
    expect(browserBridgeOn({ get: () => undefined } as never)).toBe(true);
  });
});
