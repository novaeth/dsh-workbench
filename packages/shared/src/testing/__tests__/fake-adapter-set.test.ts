import { describe, expect, it } from 'vitest';
import { adapterContractGaps } from '../../host/adapter-contract.js';
import { fakeAdapterSet } from '../fake-adapter-set.js';

const ctx = { get: () => undefined } as never;

describe('假集合：证明协议是闭合的', () => {
  it('一个最小的外来实现（不含任何具体运行时）也能过整份契约', () => {
    expect(adapterContractGaps(fakeAdapterSet(), ctx)).toEqual([]);
  });

  it('它声明的能力全是 false —— 外壳不该能从它身上猜到任何具体运行时', () => {
    expect(fakeAdapterSet().runtime.capabilities(ctx)).toEqual({
      console: false,
      pluginMarket: false,
      browserBridge: false,
      libs: false,
    });
  });

  it('覆盖项能替换任意成员（测试就地造场景）', () => {
    const set = fakeAdapterSet({ runtime: { ...fakeAdapterSet().runtime, capabilities: () => ({
      console: true,
      pluginMarket: false,
      browserBridge: false,
      libs: false,
    }) } });
    expect(set.runtime.capabilities(ctx).console).toBe(true);
  });
});
