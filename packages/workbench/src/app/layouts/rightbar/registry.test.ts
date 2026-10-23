import { describe, expect, it } from 'vitest';
import type { BoardModule } from '@dsh-workbench/shared';
import { createBoardRegistry } from './registry';

function module(id: string, order: number): BoardModule {
  return { id, titleKey: `board.${id}`, order, View: () => null };
}

function board(...modules: readonly BoardModule[]) {
  const registry = createBoardRegistry();
  for (const item of modules) registry.register(item);
  return registry;
}

describe('createBoardRegistry', () => {
  it('按 order 排序，同 order 用 id 兜底', () => {
    const registry = board(module('commits', 30), module('issues', 10), module('builds', 20), module('aaa', 20));
    expect(registry.all().map((item) => item.id)).toEqual(['issues', 'aaa', 'builds', 'commits']);
  });

  it('byId 找得到；未知 id 给 undefined（调用方决定怎么报）', () => {
    const registry = board(module('issues', 10));
    expect(registry.byId('issues')?.titleKey).toBe('board.issues');
    expect(registry.byId('nope')).toBeUndefined();
  });

  it('id 重复直接抛错（重复的 id 会让用户的持久化选择错位）', () => {
    const registry = board(module('issues', 10));
    expect(() => registry.register(module('issues', 20))).toThrow(/重复/);
  });

  it('空表是合法的（新装的工作台还没模块）', () => {
    const registry = createBoardRegistry();
    expect(registry.all()).toEqual([]);
  });

  it('后注册的模块当场可见（装完就画，不用重建注册表）', () => {
    const registry = board(module('issues', 10));
    registry.register(module('inventory', 20));
    expect(registry.all().map((item) => item.id)).toEqual(['issues', 'inventory']);
  });

  it('注销之后不再可见，且 id 可以再注册（装卸一轮不留残留）', () => {
    const registry = createBoardRegistry();
    const dispose = registry.register(module('issues', 10));
    dispose();
    expect(registry.all()).toEqual([]);
    expect(() => registry.register(module('issues', 10))).not.toThrow();
  });

  it('层名冲突当场抛，且不会把那个模块留在表里', () => {
    const first: BoardModule = {
      ...module('issues', 10),
      steps: { issue: { titleKey: 'issues.issue', View: () => null } },
    };
    const second: BoardModule = {
      ...module('inventory', 20),
      steps: { issue: { titleKey: 'inventory.issue', View: () => null } },
    };
    const registry = board(first);
    expect(() => registry.register(second)).toThrow(/层名重复/);
    expect(registry.all().map((item) => item.id)).toEqual(['issues']);
  });

  it('version 只在真的变了之后才动；订阅者收到通知', () => {
    const registry = createBoardRegistry();
    let notified = 0;
    const unsubscribe = registry.subscribe(() => {
      notified += 1;
    });
    expect(registry.version()).toBe(0);

    const dispose = registry.register(module('issues', 10));
    expect(registry.version()).toBe(1);
    dispose();
    expect(registry.version()).toBe(2);
    expect(notified).toBe(2);

    unsubscribe();
    registry.register(module('inventory', 20));
    expect(notified).toBe(2);
  });
});
