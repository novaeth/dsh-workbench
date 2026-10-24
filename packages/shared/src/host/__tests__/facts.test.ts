import { describe, expect, it } from 'vitest';
import { isFactScope, scopePrefixOf } from '../../contract/facts.js';
import { unitFactScope } from '../facts.js';

describe('unitFactScope', () => {
  it('命名空间 = 模块 id + `*`（"这个模块的数据全作废"只写一个字符串）', () => {
    expect(unitFactScope('inventory')).toBe('inventory*');
    expect(isFactScope('inventory*')).toBe(true);
    expect(isFactScope('*')).toBe(false);
    expect(isFactScope('inventory/summary')).toBe(false);
    expect(scopePrefixOf('inventory*')).toBe('inventory');
  });
});
