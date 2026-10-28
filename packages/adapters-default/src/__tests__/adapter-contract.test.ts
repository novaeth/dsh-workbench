import { describe, expect, it } from 'vitest';
import { adapterContractGaps } from '@dsh-workbench/shared/host';
import { createAdapterSet } from '../index.js';

const ctx = { get: () => undefined } as never;

describe('适配器契约（默认集合）', () => {
  it('默认集合过契约：成员、能力、health/commands、data、布局', () => {
    const set = createAdapterSet(ctx);
    expect(adapterContractGaps(set, ctx)).toEqual([]);
  });

  it('能力表把 opencli 的五项都打开', () => {
    const set = createAdapterSet(ctx);
    expect(set.runtime.capabilities(ctx)).toEqual({
      console: true,
      pluginMarket: true,
      browserBridge: true,
      libs: true,
    });
  });
});
