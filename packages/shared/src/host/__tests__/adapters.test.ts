import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '../../api/dsh.js';
import type { WorkbenchAdapters } from '../adapters.js';
import { adaptersOf, WORKBENCH_ADAPTERS } from '../adapters.js';

describe('适配器端口：apply 期读自己刚 provide 的服务', () => {
  it('严格 get 还看不见时，按非严格读得到', () => {
    const adapters = {} as WorkbenchAdapters;
    const seen: Array<boolean | undefined> = [];
    const ctx = {
      get: (name: string, strict?: boolean) => {
        if (name !== WORKBENCH_ADAPTERS) return undefined;
        seen.push(strict);
        return strict === false ? adapters : undefined;
      },
    } as unknown as DshHostContext;

    expect(adaptersOf(ctx)).toBe(adapters);
    expect(seen).toEqual([false]);
  });

  it('真的没有 provide 时照旧抛', () => {
    const ctx = { get: () => undefined } as unknown as DshHostContext;

    expect(() => adaptersOf(ctx)).toThrow('workbenchAdapters 未提供');
  });
});
