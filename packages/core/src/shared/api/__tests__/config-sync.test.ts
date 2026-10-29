import { describe, expect, it } from 'vitest';
import { CONFIG_SYNC_RESOURCE, CONFIG_SYNC_ROUTE } from '@/kernel/contract/config-sync';

describe('配置同步的契约', () => {
  it('读走 GET 的标准路由表，写走面板自己的 actions 通道', () => {
    expect(CONFIG_SYNC_ROUTE).toBe('config-sync');
    expect(CONFIG_SYNC_RESOURCE).toBe('configSync');
  });
});
