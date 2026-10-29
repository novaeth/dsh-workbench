import { describe, expect, it } from 'vitest';
import { DSH_PLUGINS_ROUTE } from '@/kernel/contract/dsh-plugins';

describe('dsh 插件只读通道的契约', () => {
  it('路由名挂进 shared 的标准路由表（路径由 API_PREFIX 决定）', () => {
    expect(DSH_PLUGINS_ROUTE).toBe('dsh-plugins');
  });
});
