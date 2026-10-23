import { describe, expect, it } from 'vitest';
import { UNIT_MANIFESTS_ROUTE } from './unit-manifests';

describe('单元清单只读通道的契约', () => {
  it('路由名挂进 shared 的标准路由表（路径由 API_PREFIX 决定）', () => {
    expect(UNIT_MANIFESTS_ROUTE).toBe('unit-manifests');
  });
});
