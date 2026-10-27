import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MARKET_BUSY_MS,
  marketBusyIds,
  publishMarketBusy,
  subscribeMarketBusy,
} from '../market-busy';

afterEach(() => {
  vi.useRealTimers();
  publishMarketBusy([]);
});

describe('「市场自己正在动它」这条事实：发布 / 整体替换 / 到点自撤', () => {
  it('发布过的单元算忙；同样的内容再发一遍不通知', () => {
    let hits = 0;
    const off = subscribeMarketBusy(() => (hits += 1));

    publishMarketBusy(['inventory']);
    expect([...marketBusyIds()]).toEqual(['inventory']);
    publishMarketBusy(['inventory']);
    expect(hits).toBe(1);

    publishMarketBusy(['inventory', 'delivery']);
    expect([...marketBusyIds()].sort()).toEqual(['delivery', 'inventory']);
    expect(hits).toBe(2);

    publishMarketBusy([]);
    expect([...marketBusyIds()]).toEqual([]);
    expect(hits).toBe(3);

    off();
    publishMarketBusy(['inventory']);
    expect(hits).toBe(3);
  });

  it('★ 整体替换：不在新名单里的当场撤（正常落地就靠这一拍）', () => {
    publishMarketBusy(['inventory']);

    publishMarketBusy(['delivery']);

    expect([...marketBusyIds()]).toEqual(['delivery']);
  });

  it('★ 同一个 id 一直发不会把期限往后顺延（到点必撤）', () => {
    vi.useFakeTimers();
    publishMarketBusy(['inventory']);

    vi.advanceTimersByTime(1000);
    publishMarketBusy(['inventory']);
    vi.advanceTimersByTime(MARKET_BUSY_MS - 1001);
    expect([...marketBusyIds()]).toEqual(['inventory']);

    vi.advanceTimersByTime(2);
    expect([...marketBusyIds()]).toEqual([]);
  });

  it('★ 发布方没了（页面卸载）也自己到期撤：不然徽标会一直哑着', () => {
    vi.useFakeTimers();
    publishMarketBusy(['inventory']);

    vi.advanceTimersByTime(MARKET_BUSY_MS - 1);
    expect([...marketBusyIds()]).toEqual(['inventory']);

    vi.advanceTimersByTime(2);
    expect([...marketBusyIds()]).toEqual([]);
  });
});
