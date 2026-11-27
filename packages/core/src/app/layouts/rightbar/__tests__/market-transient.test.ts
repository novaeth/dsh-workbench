import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  marketTransientFacts,
  resetMarketTransient,
  setMarketConfirming,
  setMarketFailed,
  setMarketNotice,
  setMarketPending,
  subscribeMarketTransient,
} from '../market-transient-state';
import type { Pending } from '../market-view-text';

const HERE = new URL('../', import.meta.url);
const UPGRADE: Pending = { id: 'hello', action: 'update', since: 1 };

afterEach(() => {
  resetMarketTransient();
});

describe('市场页的动作状态：切到会话再回来，正在升级的那一条还在', () => {
  it('★ 最后一个订阅者撤掉（面板卸载）不清状态；重新订阅还是那一条', () => {
    const off = subscribeMarketTransient(() => {});
    setMarketPending(UPGRADE);
    off();

    expect(marketTransientFacts().pending).toBe(UPGRADE);

    let hits = 0;
    const again = subscribeMarketTransient(() => (hits += 1));
    setMarketNotice('已生效');
    expect(hits).toBe(1);
    expect(marketTransientFacts().notice).toBe('已生效');
    again();
  });

  it('失败、确认与提示同住一份事实：切走也不会各自丢掉', () => {
    setMarketPending(UPGRADE);
    setMarketConfirming('hello');
    setMarketFailed({ id: 'hello', message: 'boom' });
    setMarketNotice('done');

    expect(marketTransientFacts()).toEqual({
      pending: UPGRADE,
      confirming: 'hello',
      failed: { id: 'hello', message: 'boom' },
      notice: 'done',
    });
  });

  it('内容没变不通知；reset 清空', () => {
    let hits = 0;
    const off = subscribeMarketTransient(() => (hits += 1));

    setMarketPending(UPGRADE);
    setMarketPending(UPGRADE);
    expect(hits).toBe(1);

    resetMarketTransient();
    expect(hits).toBe(2);
    expect(marketTransientFacts().pending).toBeNull();

    off();
  });
});

describe('市场页的动作状态：页面读的是页面外的那一份（接线判据）', () => {
  it('★ 正在升级那条不是组件自己的 useState', () => {
    const source = readFileSync(new URL('market-transient-state.ts', HERE), 'utf8');

    expect(source).toContain('useSyncExternalStore(subscribeMarketTransient, marketTransientFacts)');
    expect(source).toContain('setPending: setMarketPending');
    expect(source).not.toContain('useState');
  });
});
