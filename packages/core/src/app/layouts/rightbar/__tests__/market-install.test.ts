import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  marketInstallState,
  publishMarketApplied,
  publishMarketInstalling,
  resetMarketInstall,
  subscribeMarketInstall,
} from '../market-install';
import { MODULE_SETTLE_MS } from '../market-settle';

afterEach(() => {
  vi.useRealTimers();
  resetMarketInstall();
});

describe('「市场正在装 / 刚装上、等热换落地」这条事实', () => {
  it('装的过程算 installing；两个发布方互不覆盖', () => {
    publishMarketInstalling('add-module', true);
    expect(marketInstallState().installing).toBe(true);

    publishMarketInstalling('discover', true);
    publishMarketInstalling('add-module', false);
    expect(marketInstallState().installing).toBe(true);

    publishMarketInstalling('discover', false);
    expect(marketInstallState().installing).toBe(false);
  });

  it('applied 那一单元单独记着，直到期限到了才撤', () => {
    vi.useFakeTimers();
    publishMarketApplied(['hello']);

    expect([...marketInstallState().applied]).toEqual(['hello']);
    expect(marketInstallState().installing).toBe(false);

    vi.advanceTimersByTime(MODULE_SETTLE_MS - 1);
    expect([...marketInstallState().applied]).toEqual(['hello']);

    vi.advanceTimersByTime(2);
    expect([...marketInstallState().applied]).toEqual([]);
  });

  it('★ 同一单元再发一遍不顺延期限（到点必撤，别把「整个模块真的没起来」也一起哑掉）', () => {
    vi.useFakeTimers();
    publishMarketApplied(['hello']);

    vi.advanceTimersByTime(1000);
    publishMarketApplied(['hello']);
    vi.advanceTimersByTime(MODULE_SETTLE_MS - 1001);
    expect([...marketInstallState().applied]).toEqual(['hello']);

    vi.advanceTimersByTime(2);
    expect([...marketInstallState().applied]).toEqual([]);
  });

  it('★ 发布方没了（对话框关了 / 面板切走）也自己到期撤', () => {
    vi.useFakeTimers();
    publishMarketInstalling('add-module', true);
    publishMarketApplied(['hello']);

    vi.advanceTimersByTime(MODULE_SETTLE_MS + 1);
    expect(marketInstallState().installing).toBe(true);
    expect([...marketInstallState().applied]).toEqual([]);
  });

  it('内容没变不通知；变了才通知', () => {
    let hits = 0;
    const off = subscribeMarketInstall(() => (hits += 1));

    publishMarketInstalling('add-module', true);
    publishMarketInstalling('add-module', true);
    expect(hits).toBe(1);

    publishMarketApplied(['hello']);
    expect(hits).toBe(2);
    publishMarketApplied(['hello']);
    expect(hits).toBe(2);

    publishMarketInstalling('add-module', false);
    expect(hits).toBe(3);
    publishMarketApplied(['other']);
    expect(hits).toBe(4);
    publishMarketApplied(['other']);
    expect(hits).toBe(4);

    off();
    publishMarketInstalling('add-module', true);
    expect(hits).toBe(4);
  });
});
